// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IDJDEvaluatorOracleCallback {
    function receiveVerdict(
        bytes32 escrowIdHash,
        address provider,
        address counterparty,
        uint8 decisionCode,
        uint8 recommendationCode,
        bool approved,
        uint16 confidence,
        uint16 agentScoreProvider,
        bool certificationValid,
        uint16 riskScore,
        bytes32 packetHash,
        bytes32 attestationDigest,
        bytes calldata attestationSignature
    ) external;
}
