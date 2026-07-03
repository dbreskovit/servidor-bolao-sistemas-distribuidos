type Country = { name: string; iso2: string; flag?: string };

export const COUNTRIES: Country[] = [
  // Anfitriões
  { name: "Canadá", iso2: "CA" },
  { name: "México", iso2: "MX" },
  { name: "Estados Unidos", iso2: "US" },
  // AFC (Ásia)
  { name: "Austrália", iso2: "AU" },
  { name: "Iraque", iso2: "IQ" },
  { name: "Irã", iso2: "IR" },
  { name: "Japão", iso2: "JP" },
  { name: "Jordânia", iso2: "JO" },
  { name: "Coreia do Sul", iso2: "KR" },
  { name: "Catar", iso2: "QA" },
  { name: "Arábia Saudita", iso2: "SA" },
  { name: "Uzbequistão", iso2: "UZ" },
  // CAF (África)
  { name: "Argélia", iso2: "DZ" },
  { name: "Cabo Verde", iso2: "CV" },
  { name: "RD Congo", iso2: "CD" },
  { name: "Costa do Marfim", iso2: "CI" },
  { name: "Egito", iso2: "EG" },
  { name: "Gana", iso2: "GH" },
  { name: "Marrocos", iso2: "MA" },
  { name: "Senegal", iso2: "SN" },
  { name: "África do Sul", iso2: "ZA" },
  { name: "Tunísia", iso2: "TN" },
  // Concacaf (além dos anfitriões)
  { name: "Curaçao", iso2: "CW" },
  { name: "Haiti", iso2: "HT" },
  { name: "Panamá", iso2: "PA" },
  // CONMEBOL (América do Sul)
  { name: "Argentina", iso2: "AR" },
  { name: "Brasil", iso2: "BR" },
  { name: "Colômbia", iso2: "CO" },
  { name: "Equador", iso2: "EC" },
  { name: "Paraguai", iso2: "PY" },
  { name: "Uruguai", iso2: "UY" },
  // OFC (Oceania)
  { name: "Nova Zelândia", iso2: "NZ" },
  // UEFA (Europa)
  { name: "Áustria", iso2: "AT" },
  { name: "Bélgica", iso2: "BE" },
  { name: "Bósnia e Herzegovina", iso2: "BA" },
  { name: "Croácia", iso2: "HR" },
  { name: "Tchéquia", iso2: "CZ" },
  {
    name: "Inglaterra",
    iso2: "GB-ENG",
    flag: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  },
  { name: "França", iso2: "FR" },
  { name: "Alemanha", iso2: "DE" },
  { name: "Países Baixos", iso2: "NL" },
  { name: "Noruega", iso2: "NO" },
  { name: "Portugal", iso2: "PT" },
  {
    name: "Escócia",
    iso2: "GB-SCT",
    flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  },
  { name: "Espanha", iso2: "ES" },
  { name: "Suécia", iso2: "SE" },
  { name: "Suíça", iso2: "CH" },
  { name: "Turquia", iso2: "TR" },
]; // 48 países

export function flagFromIso2(iso2: string): string {
  return String.fromCodePoint(
    ...[...iso2.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  );
}

export function countryFlag(c: Country): string {
  return c.flag ?? flagFromIso2(c.iso2);
}

export function findCountry(name: string): Country | undefined {
  return COUNTRIES.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
}
