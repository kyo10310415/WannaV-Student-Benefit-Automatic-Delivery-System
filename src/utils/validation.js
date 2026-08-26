const VALID_MISSION_NUMBERS = new Set([1, 2, 3]);

/**
 * 外部入力のミッション番号を安全な整数へ変換する。
 * DBのカラム名へ埋め込む値なので、許可リスト外は必ず拒否する。
 */
function parseMissionNo(value) {
  const missionNo = typeof value === 'number'
    ? value
    : Number(String(value ?? '').trim());

  if (!Number.isInteger(missionNo) || !VALID_MISSION_NUMBERS.has(missionNo)) {
    throw new RangeError('missionNo は 1〜3 の整数で指定してください');
  }

  return missionNo;
}

module.exports = {
  parseMissionNo
};
