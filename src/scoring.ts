// pa,pb = palpite; ra,rb = resultado real
export function calcPoints(pa: number, pb: number, ra: number, rb: number): number {
  if (pa === ra && pb === rb) return 10; // placar exato
  const sign = (a: number, b: number) => Math.sign(a - b);
  if (sign(pa, pb) === sign(ra, rb)) return 5; // acertou resultado/vencedor
  return 0;
}
