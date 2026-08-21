/**
 * Dane rejestrowe usługodawcy — jedno źródło prawdy dla stopki i dla JSON-LD
 * Organization. Muszą zgadzać się z administratorem danych wskazanym w
 * `src/pages/polityka-prywatnosci.astro`; rozjazd między polityką, stopką
 * i danymi strukturalnymi to sygnał niespójności, nie zaufania.
 *
 * Jednoosobowa działalność gospodarcza, więc NIP + REGON i brak KRS.
 */
export const COMPANY = {
  brand: "LoyaltyGo",
  legalName: "Karol Szmaj Augmented Industry",
  street: "os. Jagiellońskie 3 lok. 6",
  postalCode: "61-224",
  city: "Poznań",
  /** ISO 3166-1 alpha-2, wymagane przez schema.org PostalAddress. */
  country: "PL",
  nip: "5140306753",
  regon: "382174238",
  email: "kontakt@loyaltygo.pl",
  url: "https://loyaltygo.pl",
} as const;
