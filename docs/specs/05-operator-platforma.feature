# language: pl

Funkcja: Utrzymanie platformy i integracja z wystawcą kart
  Jako operator platformy LoyaltyGo
  Chcę, aby wydawanie i aktualizacja kart działały mimo awarii dostawcy zewnętrznego
  Aby merchant i klient nie tracili punktów ani zaufania do programu

  Założenia:
    Zakładając, że karty Apple Wallet i Google Wallet wystawia zewnętrzny dostawca passkit.com
    Oraz źródłem prawdy o punktach, członkostwach i ofertach jest backend LoyaltyGo
    Oraz karta w portfelu jest odzwierciedleniem stanu z backendu

  # ------------------------------------------------------------------
  # Wydawanie i aktualizacja kart
  # ------------------------------------------------------------------

  Scenariusz: Wydanie karty po onboardingu klienta
    Zakładając, że klient ukończył formularz onboardingowy
    Gdy backend zleca wystawienie karty u dostawcy
    Wtedy karta powstaje z brandingiem merchanta i saldem 0 punktów
    Oraz klient dostaje link do dodania jej do portfela

  @corner
  Scenariusz: Awaria dostawcy podczas wydawania karty
    Zakładając, że dostawca zwraca błąd lub nie odpowiada
    Gdy backend zleca wystawienie karty
    Wtedy członkostwo klienta pozostaje zapisane
    Oraz zlecenie trafia do kolejki ponowień
    Oraz po udanym wydaniu klient dostaje link na adres e-mail
    Oraz operator widzi zdarzenie w monitoringu

  @corner
  Scenariusz: Awaria dostawcy podczas aktualizacji salda
    Zakładając, że transakcja klienta została zarejestrowana i punkty naliczone w backendzie
    Gdy aktualizacja karty u dostawcy się nie powiedzie
    Wtedy saldo w backendzie i w panelu merchanta jest poprawne
    Oraz karta w portfelu nadgania stan przy kolejnej udanej synchronizacji
    Ale rozbieżność nigdy nie powoduje utraty punktów

  @corner
  Scenariusz: Trwała niezgodność karty ze stanem backendu
    Zakładając, że karta klienta nie zsynchronizowała się mimo ponowień
    Gdy operator przegląda raport rozbieżności
    Wtedy widzi listę członkostw wymagających ponownej synchronizacji
    Oraz może wymusić ponowne wystawienie karty bez utraty salda ani historii ofert

  Scenariusz: Propagacja zmiany brandingu na wydane karty
    Zakładając, że merchant zmienił logo i kolory karty
    Gdy zmiana jest przekazywana do dostawcy
    Wtedy wszystkie wydane karty tego programu otrzymują nowy wygląd
    Oraz saldo punktów i lista ofert pozostają nienaruszone

  # ------------------------------------------------------------------
  # Limity i koszty dostawcy
  # ------------------------------------------------------------------

  @corner
  Scenariusz: Przekroczenie limitu wystawionych kart u dostawcy
    Zakładając, że plan u dostawcy ma limit liczby aktywnych kart
    Gdy limit zostaje wyczerpany
    Wtedy nowi klienci widzą komunikat o chwilowej niedostępności programu
    Oraz operator dostaje alert
    Oraz istniejące karty działają bez zmian

  # ------------------------------------------------------------------
  # Bezpieczeństwo i dane
  # ------------------------------------------------------------------

  @bezpieczenstwo
  Scenariusz: Rozdzielność danych między programami merchantów
    Zakładając, że ten sam adres e-mail występuje w programach dwóch merchantów
    Gdy operator lub merchant przegląda dane
    Wtedy oba członkostwa są odrębnymi rekordami
    Oraz żaden merchant nie ma wglądu w dane drugiego programu

  @bezpieczenstwo
  Scenariusz: Rotacja poświadczeń dostawcy kart
    Zakładając, że poświadczenia integracji z dostawcą wymagają wymiany
    Gdy operator podmienia klucze
    Wtedy wystawianie i aktualizacja kart działają bez przerwy dla merchantów
    Oraz stare poświadczenia przestają być akceptowane

  @bezpieczenstwo @zalozenie
  Scenariusz: Żądanie usunięcia danych klienta
    Zakładając, że klient zgłasza merchantowi żądanie usunięcia danych
    Gdy merchant przekazuje żądanie operatorowi
    Wtedy członkostwo klienta zostaje usunięte lub zanonimizowane
    Oraz jego karta przestaje być aktualizowana
    Oraz zagregowana historia transakcji merchanta pozostaje spójna
