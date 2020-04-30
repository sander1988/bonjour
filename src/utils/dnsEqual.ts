const upperCaseLetters = /[A-Z]/g;

export default function (a: string, b: string): boolean {
  a = a.replace(upperCaseLetters, value => value.toLowerCase());
  b = b.replace(upperCaseLetters, value => value.toLowerCase());
  return a === b;
}
