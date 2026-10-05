export const protectionChapters = [
  {
    title: "Electricity before payment",
    description:
      "Your charger supplies electricity. Your partner’s payment comes later. Payment terms alone don’t track the value being delivered during this session.",
    caption:
      "Without live protection, delivered service can move ahead of secured payment.",
    detail:
      "The space between the two marks is service value potentially at risk.",
    service: 52,
    protected: 0,
    evidence: "none",
  },
  {
    title: "Secure payment as charging progresses",
    description:
      "Verified readings establish the charging value. Funded payment approval makes that value collectible. A small rolling reserve provides room for continued charging.",
    caption:
      "Accepted reading → funded approval → payment protection advances.",
    detail:
      "Secured payment is collectible under the payment channel’s rules. It has not necessarily been collected yet.",
    service: 60,
    protected: 60,
    evidence: "accepted",
  },
  {
    title: "A reading cannot be trusted",
    description:
      "This reading is rejected. Rove stops advancing payment protection and estimates how much additional service could be at risk.",
    caption: "Protection stays put. A conservative upper bound grows.",
    detail:
      "The amber region is a possible exposure bound, not a claim about exact electricity consumption.",
    service: 77,
    protected: 60,
    evidence: "rejected",
  },
  {
    title: "Reach the agreed limit",
    description:
      "When possible exposure reaches your limit, Rove requires charging to pause. Service must not continue beyond the agreed boundary.",
    caption: "The risk allowance is exhausted. Charging must pause.",
    detail:
      "Your charging system enforces the pause; this example uses a simulated charger.",
    service: 90,
    protected: 60,
    evidence: "rejected",
  },
  {
    title: "Restore protection",
    description:
      "Valid readings and sufficient funded approval restore protection. Charging can resume once the recovery checks pass.",
    caption:
      "Accepted evidence resolves uncertainty. Payment protection catches up.",
    detail:
      "Recovery needs trustworthy readings and funded payment approval. It is not a manual reset of the warning.",
    service: 83,
    protected: 83,
    evidence: "accepted",
  },
] as const;

export type ProtectionChapter = (typeof protectionChapters)[number];
