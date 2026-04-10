// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract DJDEvaluatorVerdictVerifier {
    bytes32 public constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId)");
    bytes32 public constant EVALUATOR_VERDICT_TYPEHASH =
        keccak256(
            "EvaluatorVerdict(string verdictId,address wallet,address counterpartyWallet,string escrowId,string decision,string recommendation,bool approved,uint16 confidence,uint16 agentScoreProvider,string scoreModelVersion,bool certificationValid,string certificationTier,string riskLevel,uint16 riskScore,string forensicTraceId,bytes32 packetHash,string generatedAt)"
        );
    bytes32 internal constant SECP256K1N_HALVED =
        0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

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

    address public owner;
    address public oracleSigner;
    bytes32 public immutable domainSeparator;

    event OracleSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error InvalidOwner();
    error InvalidSigner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert InvalidOwner();
        _;
    }

    constructor(address initialSigner) {
        if (initialSigner == address(0)) revert InvalidSigner();

        owner = msg.sender;
        oracleSigner = initialSigner;
        domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes("DJD Evaluator Verdict")),
                keccak256(bytes("1")),
                block.chainid
            )
        );

        emit OwnershipTransferred(address(0), msg.sender);
        emit OracleSignerUpdated(address(0), initialSigner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidOwner();

        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function setOracleSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidSigner();

        address previousSigner = oracleSigner;
        oracleSigner = newSigner;
        emit OracleSignerUpdated(previousSigner, newSigner);
    }

    function hashVerdict(EvaluatorVerdict calldata verdict) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, _hashStruct(verdict)));
    }

    function verifyVerdict(
        EvaluatorVerdict calldata verdict,
        bytes calldata signature
    ) external view returns (bool) {
        return verifyDigest(hashVerdict(verdict), signature);
    }

    function verifyDigest(bytes32 digest, bytes calldata signature) public view returns (bool) {
        address recovered = _recoverSigner(digest, signature);
        return recovered != address(0) && recovered == oracleSigner;
    }

    function _hashStruct(EvaluatorVerdict calldata verdict) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                EVALUATOR_VERDICT_TYPEHASH,
                keccak256(bytes(verdict.verdictId)),
                verdict.wallet,
                verdict.counterpartyWallet,
                keccak256(bytes(verdict.escrowId)),
                keccak256(bytes(verdict.decision)),
                keccak256(bytes(verdict.recommendation)),
                verdict.approved,
                verdict.confidence,
                verdict.agentScoreProvider,
                keccak256(bytes(verdict.scoreModelVersion)),
                verdict.certificationValid,
                keccak256(bytes(verdict.certificationTier)),
                keccak256(bytes(verdict.riskLevel)),
                verdict.riskScore,
                keccak256(bytes(verdict.forensicTraceId)),
                verdict.packetHash,
                keccak256(bytes(verdict.generatedAt))
            )
        );
    }

    function _recoverSigner(
        bytes32 digest,
        bytes calldata signature
    ) internal pure returns (address recovered) {
        if (signature.length != 65) {
            return address(0);
        }

        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        if (uint256(s) > uint256(SECP256K1N_HALVED)) {
            return address(0);
        }

        if (v != 27 && v != 28) {
            return address(0);
        }

        recovered = ecrecover(digest, v, r, s);
    }
}
