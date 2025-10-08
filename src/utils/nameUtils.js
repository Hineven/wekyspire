export function signedNumberString(num) {
  if(num > 0) return `+${num}`;
  if(num < 0) return `-${num}`;
  return `${num}`;
}

export function signedNumberStringW0(num) {
  if(num > 0) return `+${num}`;
  if(num < 0) return `-${num}`;
  return '';
}

export function countString (num, suffix = '') {
  if(num === 0) return '';
  return `${num}${suffix}`;
}