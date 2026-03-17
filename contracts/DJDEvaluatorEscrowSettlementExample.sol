// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDJDEvaluatorVerdictVerifier {
    struct EvaluatorVerdict {
        string verdictId;
        address wallet;
        address counterpartyWallet;
        string escrowId;
        string decision;
        string recommendation;
        bool approved;
        uint16 confidence;
        uint16 agentScoreProvider;
        string scoreModelVersion;
        bool certificationValid;
        string certificationTier;
        string riskLevel;
        uint16 riskScore;
        string forensicTraceId;
        bytes32 packetHash;
        string generatedAt;
    }

    function hashVerdict(
        EvaluatorVerdict calldata verdict
    ) external view returns (bytes32);

    function verifyVerdict(
        EvaluatorVerdict calldata verdict,
        bytes calldata signature
    ) external view returns (bool);
}

contract DJDEvaluatorEscrowSettlementExample {
    enum SettlementOutcome {
        None,
        Release,
        ManualReview,
        Dispute,
        Reject
    }

    bytes32 internal constant RELEASE_RECOMMENDATION_HASH =
        keccak256(bytes("release"));
    bytes32 internal constant MANUAL_REVIEW_RECOMMENDATION_HASH =
        keccak256(bytes("manual_review"));
    bytes32 internal constant DISPUTE_RECOMMENDATION_HASH =
        keccak256(bytes("dispute"));

    IDJDEvaluatorVerdictVerifier public immutable verifier;
    address public immutable provider;
    address public immutable counterparty;
    bytes32 public immutable escrowIdHash;

    bool public settled;
    SettlementOutcome public outcome;
    bytes32 public lastVerdictDigest;
    bytes32 public lastPacketHash;

    event VerdictSettled(
        bytes32 indexed verdictDigest,
        bytes32 indexed packetHash,
        SettlementOutcome outcome,
        bool approved,
        address provider,
        address counterparty
    );

    error AlreadySettled();
    error InvalidVerifier();
    error InvalidProvider();
    error ProviderMismatch();
    error CounterpartyMismatch();
    error EscrowIdMismatch();
    error InvalidVerdictSignature();

    constructor(
        address verifier_,
        address provider_,
        address counterparty_,
        bytes32 escrowIdHash_
    ) {
        if (verifier_ == address(0)) revert InvalidVerifier();
        if (provider_ == address(0)) revert InvalidProvider();

        verifier = IDJDEvaluatorVerdictVerifier(verifier_);
        provider = provider_;
        counterparty = counterparty_;
        escrowIdHash = escrowIdHash_;
    }

    function settleWithDJDVerdict(
        IDJDEvaluatorVerdictVerifier.EvaluatorVerdict calldata verdict,
        bytes calldata signature
    ) external returns (SettlementOutcome resolvedOutcome) {
        if (settled) revert AlreadySettled();
        if (verdict.wallet != provider) revert ProviderMismatch();
        if (
            counterparty != address(0) &&
            verdict.counterpartyWallet != counterparty
        ) revert CounterpartyMismatch();
        if (
            escrowIdHash != bytes32(0) &&
            keccak256(bytes(verdict.escrowId)) != escrowIdHash
        ) revert EscrowIdMismatch();
        if (!verifier.verifyVerdict(verdict, signature)) {
            revert InvalidVerdictSignature();
        }

        bytes32 recommendationHash = keccak256(bytes(verdict.recommendation));
        if (verdict.approved && recommendationHash == RELEASE_RECOMMENDATION_HASH) {
            resolvedOutcome = SettlementOutcome.Release;
        } else if (recommendationHash == MANUAL_REVIEW_RECOMMENDATION_HASH) {
            resolvedOutcome = SettlementOutcome.ManualReview;
        } else if (recommendationHash == DISPUTE_RECOMMENDATION_HASH) {
            resolvedOutcome = SettlementOutcome.Dispute;
        } else {
            resolvedOutcome = SettlementOutcome.Reject;
        }

        settled = true;
        outcome = resolvedOutcome;
        lastVerdictDigest = verifier.hashVerdict(verdict);
        lastPacketHash = verdict.packetHash;

        emit VerdictSettled(
            lastVerdictDigest,
            verdict.packetHash,
            resolvedOutcome,
            verdict.approved,
            verdict.wallet,
            verdict.counterpartyWallet
        );
    }

    function releaseAuthorized() external view returns (bool) {
        return outcome == SettlementOutcome.Release;
    }
}
