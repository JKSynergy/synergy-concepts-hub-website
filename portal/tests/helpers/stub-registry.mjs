let _verify = { outcome: "verified", observedStatus: "INACTIVE" };
export function __setVerifyOutcome(v) { _verify = v; }

export function getAdapter() {
  return {
    operations: {
      verifyOperation: async () => _verify,
    },
  };
}
