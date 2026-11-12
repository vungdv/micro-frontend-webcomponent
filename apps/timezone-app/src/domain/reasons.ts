/** Validation reason codes (spec §3.3). */
export type Reason =
  | 'unknown-zone'
  | 'duplicate-zone'
  | 'too-many-zones'
  | 'invalid-time'
  | 'zero-length'
  | 'duplicate-range'
  | 'too-many-ranges';

/** User-facing message per reason code (spec §3.3). */
export const MESSAGES: Readonly<Record<Reason, string>> = {
  'unknown-zone': 'Unknown time zone',
  'duplicate-zone': 'Already added',
  'too-many-zones': 'Up to 10 time zones',
  'invalid-time': 'Enter a valid time',
  'zero-length': 'Start and end must differ',
  'duplicate-range': 'Already added',
  'too-many-ranges': 'Up to 10 time ranges',
};
