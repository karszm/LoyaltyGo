# language: pl

Funkcja: Panel merchanta
  Jako merchant
  Chcę samodzielnie skonfigurować i prowadzić program lojalnościowy
  Aby lojalizować klientów bez wdrożenia IT i bez nowego sprzętu

  Założenia:
    Zakładając, że panel merchanta jest aplikacją webową zintegrowaną z backendem platformy
    Oraz merchant loguje się na własne konto
    Oraz merchant widzi wyłącznie dane swojego programu

  # ------------------------------------------------------------------
  # Uwierzytelnianie — passwordless i logowanie społecznościowe
  # ------------------------------------------------------------------
  # W systemie nie ma haseł. Merchant loguje się linkiem lub kodem
  # jednorazowym wysłanym na adres e-mail, albo kontem Apple lub Google.
  # Rejestracja i logowanie to ta sama ścieżka — konto powstaje przy
  # pierwszym udanym uwierzytelnieniu.

  Scenariusz: Pierwsze wejście przez link jednorazowy
    Zakładając, że jestem na landing page LoyaltyGo i nie mam konta
    Gdy klikam "Zaloguj się" i podaję adres "kontakt@salon.pl"
    Wtedy dostaję wiadomość z linkiem jednorazowym oraz kodem jednorazowym
    Gdy klikam link z wiadomości
    Wtedy jestem zalogowany
    Oraz moje konto merchanta zostaje utworzone
    Oraz proszony jestem o podanie nazwy firmy
    Oraz trafiam do kreatora karty lojalnościowej

  Scenariusz: Logowanie kodem jednorazowym zamiast linku
    Zakładając, że poprosiłem o logowanie na adres "kontakt@salon.pl"
    Gdy przepisuję kod z wiadomości w formularzu logowania
    Wtedy jestem zalogowany
    Oraz link z tej samej wiadomości przestaje działać

  Scenariusz: Logowanie kontem Google lub Apple
    Zakładając, że jestem na ekranie logowania
    Gdy wybieram "Kontynuuj z Google" albo "Kontynuuj z Apple"
    Oraz potwierdzam zgodę u dostawcy tożsamości
    Wtedy jestem zalogowany
    Oraz przy pierwszym logowaniu powstaje moje konto merchanta

  Scenariusz: Powrót istniejącego merchanta
    Zakładając, że mam konto założone linkiem jednorazowym na adres "kontakt@salon.pl"
    Gdy loguję się kontem Google o tym samym adresie
    Wtedy trafiam do tego samego konta merchanta
    Oraz nie powstaje drugie konto ani drugi program

  @corner @bezpieczenstwo
  Scenariusz: Wygasły link jednorazowy
    Zakładając, że poprosiłem o link ponad 15 minut temu
    Gdy klikam ten link
    Wtedy widzę komunikat, że link wygasł
    Oraz mogę jednym kliknięciem poprosić o nowy
    Oraz nie zostaję zalogowany

  @corner @bezpieczenstwo
  Scenariusz: Ponowne użycie zużytego linku
    Zakładając, że zalogowałem się już linkiem jednorazowym
    Gdy ktoś otworzy ten sam link ponownie
    Wtedy link jest odrzucony jako zużyty
    Oraz nie powstaje nowa sesja

  @corner @bezpieczenstwo
  Scenariusz: Kolejne żądanie logowania unieważnia poprzednie
    Zakładając, że poprosiłem o logowanie dwa razy pod rząd
    Gdy klikam link z pierwszej wiadomości
    Wtedy link jest odrzucony jako nieaktualny
    Oraz działa wyłącznie link i kod z najnowszej wiadomości

  @corner @bezpieczenstwo
  Scenariusz: Błędny kod jednorazowy
    Zakładając, że poprosiłem o kod jednorazowy
    Gdy podaję błędny kod pięć razy z rzędu
    Wtedy kod zostaje unieważniony
    Oraz muszę poprosić o nowy
    Oraz kolejne próby są czasowo ograniczone

  @corner @bezpieczenstwo
  Scenariusz: Ograniczenie częstotliwości wysyłki
    Zakładając, że poprosiłem właśnie o link logowania
    Gdy natychmiast proszę o kolejny
    Wtedy widzę informację, ile sekund muszę odczekać
    Oraz liczba wiadomości na adres i na urządzenie jest ograniczona w czasie

  @corner @bezpieczenstwo
  Scenariusz: Żądanie logowania na nieistniejący adres nie ujawnia stanu konta
    Gdy podaję adres, dla którego nie ma konta ani nie chcę go zakładać
    Wtedy widzę ten sam komunikat co zawsze: "sprawdź swoją skrzynkę"
    Ale odpowiedź nie ujawnia, czy konto o tym adresie istnieje

  @corner
  Scenariusz: Wiadomość z linkiem nie dociera
    Zakładając, że poprosiłem o logowanie i nie widzę wiadomości
    Gdy po upływie okresu blokady proszę o ponowną wysyłkę
    Wtedy dostaję nową wiadomość
    Oraz widzę podpowiedź, by sprawdzić folder spam
    Oraz poprzedni link i kod przestają działać

  @corner
  Scenariusz: Link otwarty na innym urządzeniu niż żądanie
    Zakładając, że poprosiłem o link na komputerze
    Gdy otwieram go na telefonie
    Wtedy loguję się na telefonie
    Oraz karta w przeglądarce na komputerze informuje, że logowanie odbyło się gdzie indziej
    Oraz mogę tam dokończyć logowanie kodem z tej samej wiadomości

  @corner @zalozenie
  Scenariusz: Logowanie Apple z ukrytym adresem e-mail
    Zakładając, że loguję się kontem Apple z opcją ukrycia adresu
    Gdy konto zostaje utworzone
    Wtedy działa ono na adresie przekierowującym Apple
    Oraz proszony jestem o podanie kontaktowego adresu firmy
    Oraz powiadomienia systemowe idą na adres przekierowujący, dopóki go nie zmienię

  @corner
  Scenariusz: Dostawca tożsamości nie zwraca adresu e-mail
    Zakładając, że loguję się kontem społecznościowym bez zgody na udostępnienie adresu
    Gdy próbuję dokończyć logowanie
    Wtedy widzę komunikat, że adres e-mail jest wymagany do prowadzenia programu
    Oraz mogę zalogować się linkiem jednorazowym zamiast konta społecznościowego

  @corner @bezpieczenstwo
  Scenariusz: Odmowa zgody u dostawcy tożsamości
    Zakładając, że wybrałem "Kontynuuj z Google"
    Gdy anuluję zgodę w oknie dostawcy
    Wtedy wracam na ekran logowania z informacją o przerwanym logowaniu
    Oraz nie powstaje żadne konto

  Scenariusz: Wylogowanie
    Zakładając, że jestem zalogowany w panelu
    Gdy wybieram "Wyloguj"
    Wtedy moja sesja zostaje zakończona
    Oraz powrót przyciskiem "wstecz" nie pokazuje danych z panelu

  @corner @bezpieczenstwo
  Scenariusz: Wygaśnięcie sesji podczas pracy w panelu
    Zakładając, że jestem zalogowany i mam otwarty kreator oferty
    Gdy moja sesja wygasa
    Oraz zapisuję ofertę
    Wtedy zostaję przekierowany do logowania
    Oraz po zalogowaniu wracam do formularza z zachowanymi danymi
    Oraz oferta nie zostaje zapisana dwukrotnie

  # ------------------------------------------------------------------
  # Kreator karty i publikacja programu
  # ------------------------------------------------------------------

  Scenariusz: Konfiguracja karty lojalnościowej i publikacja programu
    Zakładając, że jestem zalogowany i mój program nie jest opublikowany
    Gdy ustawiam nazwę wyświetlaną, logo, kolor tła i opis programu
    Oraz ustawiam przelicznik "10 punktów za każde 100 zł"
    Oraz klikam "Opublikuj program"
    Wtedy program jest aktywny
    Oraz otrzymuję statyczny link zapraszający wraz z kodem QR do pobrania i wydruku

  @corner @zalozenie
  Scenariusz: Próba publikacji programu bez kompletu brandingu
    Zakładając, że nie ustawiłem nazwy wyświetlanej ani logo
    Gdy klikam "Opublikuj program"
    Wtedy widzę listę brakujących pól
    Oraz program pozostaje nieopublikowany
    Oraz link zapraszający nie działa dla klientów

  @corner
  Scenariusz: Logo w nieobsługiwanym formacie lub rozmiarze
    Zakładając, że jestem w kreatorze karty
    Gdy wgrywam plik o rozmiarze 20 MB w formacie BMP
    Wtedy widzę komunikat o dozwolonych formatach i maksymalnym rozmiarze
    Oraz poprzednie logo pozostaje bez zmian

  @corner
  Scenariusz: Zbyt niski kontrast kolorów karty
    Zakładając, że ustawiam białą czcionkę na białym tle
    Gdy zapisuję branding
    Wtedy widzę ostrzeżenie o nieczytelnej karcie
    Oraz mogę zapisać mimo ostrzeżenia
    Oraz podgląd karty pokazuje realny efekt

  Scenariusz: Zmiana brandingu po wydaniu kart
    Zakładając, że mam 40 klientów z wydanymi kartami
    Gdy zmieniam logo i kolor karty
    Wtedy zmiana jest zlecana do propagacji na wszystkie wydane karty
    Oraz w panelu widzę status propagacji
    Oraz punkty i oferty klientów pozostają nietknięte

  # ------------------------------------------------------------------
  # Przelicznik punktów
  # ------------------------------------------------------------------

  Szablon scenariusza: Naliczanie punktów według przelicznika merchanta
    Zakładając, że mój przelicznik to <punkty_za_zl> punktu za każdą 1 zł
    Gdy dla klienta rejestrowana jest transakcja na kwotę <kwota> zł
    Wtedy klient otrzymuje <punkty> punktów
    Oraz wynik jest zaokrąglany w dół do pełnego punktu

    Przykłady:
      | punkty_za_zl | kwota  | punkty |
      | 0.1          | 100.00 | 10     |
      | 0.1          | 49.99  | 4      |
      | 1            | 250.00 | 250    |
      | 0.5          | 0.99   | 0      |

  @corner
  Scenariusz: Walidacja przelicznika punktów
    Zakładając, że jestem w ustawieniach programu
    Gdy podaję przelicznik równy zero lub wartość ujemną
    Wtedy widzę komunikat o dozwolonym zakresie
    Oraz poprzedni przelicznik pozostaje aktywny

  @corner
  Scenariusz: Zmiana przelicznika nie działa wstecz
    Zakładając, że klient zebrał 120 punktów przy przeliczniku "10 punktów za 100 zł"
    Gdy zmieniam przelicznik na "20 punktów za 100 zł"
    Wtedy saldo klienta nadal wynosi 120 punktów
    Oraz nowy przelicznik obowiązuje wyłącznie dla transakcji zarejestrowanych po zmianie

  # ------------------------------------------------------------------
  # Klucz programu dla SDK
  # ------------------------------------------------------------------

  Scenariusz: Pobranie klucza programu do konfiguracji SoftPOS
    Zakładając, że mój program jest opublikowany
    Gdy otwieram zakładkę "Integracja"
    Wtedy widzę klucz programu do wpisania w konfiguracji aplikacji SoftPOS
    Oraz widzę instrukcję, jak przekazać go dostawcy SoftPOS
    Oraz widzę datę ostatniego użycia klucza

  @bezpieczenstwo
  Scenariusz: Unieważnienie i wymiana klucza programu
    Zakładając, że mój klucz programu mógł wyciec
    Gdy generuję nowy klucz
    Wtedy stary klucz przestaje działać natychmiast
    Oraz operacje z aplikacji SoftPOS używających starego klucza są odrzucane
    Oraz widzę ostrzeżenie, że SoftPOS wymaga rekonfiguracji
    Ale dotychczasowe transakcje, punkty i oferty pozostają nienaruszone

  @corner
  Scenariusz: Klucz programu przed publikacją programu
    Zakładając, że mój program nie jest opublikowany
    Gdy otwieram zakładkę "Integracja"
    Wtedy widzę informację, że klucz zostanie udostępniony po publikacji programu

  # ------------------------------------------------------------------
  # Cykl życia programu
  # ------------------------------------------------------------------

  Scenariusz: Zawieszenie programu
    Zakładając, że mój program jest opublikowany
    Gdy zawieszam program
    Wtedy link zapraszający przestaje przyjmować nowych klientów
    Oraz skanowanie kart i rejestracja transakcji są odrzucane
    Oraz karty klientów pozostają w portfelach z zachowanym saldem
    Oraz mogę wznowić program w dowolnym momencie

  Scenariusz: Zamknięcie programu
    Zakładając, że chcę zakończyć program lojalnościowy
    Gdy zamykam program i potwierdzam decyzję
    Wtedy widzę ostrzeżenie o liczbie klientów, którzy stracą dostęp do zebranych punktów
    Oraz po potwierdzeniu link zapraszający i skanowanie kart przestają działać
    Oraz historia transakcji pozostaje dostępna w panelu
    Ale zamknięcia nie da się cofnąć jednym kliknięciem

  @corner
  Scenariusz: Transakcja zsynchronizowana po zawieszeniu programu
    Zakładając, że zawiesiłem program
    Gdy z kolejki offline dociera transakcja wykonana przed zawieszeniem
    Wtedy transakcja jest przyjmowana i punkty naliczane
    Ponieważ liczy się moment wykonania transakcji, nie moment synchronizacji

  # ------------------------------------------------------------------
  # Klienci lojalnościowi
  # ------------------------------------------------------------------

  Scenariusz: Podgląd listy klientów lojalnościowych
    Zakładając, że do mojego programu dołączyło 12 klientów
    Gdy otwieram zakładkę "Klienci"
    Wtedy widzę imię, nazwisko, adres e-mail, saldo punktów i datę ostatniej transakcji każdego z nich
    Oraz mogę wyszukać klienta po nazwisku lub adresie e-mail

  Scenariusz: Pusta lista klientów zaraz po publikacji programu
    Zakładając, że opublikowałem program i nikt jeszcze nie dołączył
    Gdy otwieram zakładkę "Klienci"
    Wtedy widzę stan pusty z instrukcją, gdzie umieścić kod QR zaproszenia

  Scenariusz: Blokada członkostwa klienta
    Zakładając, że klient nadużywa programu
    Gdy blokuję jego członkostwo na liście klientów
    Wtedy skanowanie jego karty na kasie zwraca informację o nieaktywnym członkostwie
    Oraz jego punkty i historia pozostają widoczne w panelu
    Oraz mogę odblokować członkostwo w dowolnym momencie

  @corner
  Scenariusz: Transakcja zablokowanego klienta z kolejki offline
    Zakładając, że zablokowałem klienta po jego wizycie
    Gdy z kolejki offline dociera jego transakcja wykonana przed blokadą
    Wtedy transakcja trafia do historii
    Oraz punkty są naliczane zgodnie ze stanem z momentu wykonania transakcji

  @corner @bezpieczenstwo
  Scenariusz: Izolacja danych między merchantami
    Zakładając, że klient o adresie "karol@example.com" należy do programu innego merchanta
    Gdy wyszukuję ten adres na mojej liście klientów
    Wtedy nie widzę żadnego wyniku
    Oraz nie mam żadnego dostępu do jego punktów ani transakcji

  @corner @bezpieczenstwo
  Scenariusz: Próba odczytu cudzego rekordu po bezpośrednim identyfikatorze
    Zakładając, że znam identyfikator klienta z programu innego merchanta
    Gdy odpytuję o ten rekord z poziomu mojej sesji
    Wtedy dostaję odpowiedź "brak dostępu"
    Oraz próba jest odnotowana w logu bezpieczeństwa

  # ------------------------------------------------------------------
  # Oferty
  # ------------------------------------------------------------------

  Scenariusz: Utworzenie kuponu jednorazowego
    Zakładając, że mój program jest opublikowany
    Gdy tworzę ofertę "Rabat 25% na strzyżenie"
    Wtedy oferta jest aktywna dla wszystkich członków programu
    Oraz każdy członek może ją zrealizować dokładnie raz

  Scenariusz: Dezaktywacja oferty
    Zakładając, że oferta "Rabat 25% na strzyżenie" jest aktywna
    Oraz siedmiu klientów już ją zrealizowało
    Gdy dezaktywuję ofertę
    Wtedy oferta znika z listy dostępnych przy skanowaniu kart
    Oraz siedem zrealizowanych kuponów pozostaje w historii
    Ale klienci, którzy jej nie zrealizowali, tracą do niej dostęp

  @corner
  Scenariusz: Walidacja pustej lub zbyt długiej treści oferty
    Zakładając, że tworzę nową ofertę
    Gdy zostawiam tytuł pusty albo przekraczam limit znaków widoczny na karcie Wallet
    Wtedy widzę komunikat walidacyjny z podglądem, jak treść zmieści się na karcie
    Oraz oferta nie zostaje zapisana

  # ------------------------------------------------------------------
  # Historia transakcji
  # ------------------------------------------------------------------

  Scenariusz: Podgląd historii transakcji
    Zakładając, że w moim programie zarejestrowano transakcje
    Gdy otwieram zakładkę "Transakcje"
    Wtedy widzę datę, klienta, kwotę, naliczone punkty i identyfikator transakcji
    Oraz widzę, które transakcje wiązały się z realizacją kuponu

  Scenariusz: Transakcja anulowana po zwrocie
    Zakładając, że transakcja o identyfikatorze "TX-1001" została anulowana zwrotem
    Gdy przeglądam historię transakcji
    Wtedy wpis "TX-1001" ma status "anulowana"
    Oraz widzę liczbę punktów cofniętych klientowi
    Oraz wpis nie znika z historii

  @corner @offline
  Scenariusz: Transakcja zsynchronizowana z opóźnieniem
    Zakładając, że kasa działała bez dostępu do sieci
    Gdy transakcja zostaje zsynchronizowana po odzyskaniu połączenia
    Wtedy w historii widnieje czas wykonania transakcji na kasie, nie czas synchronizacji
    Oraz wpis jest oznaczony jako zsynchronizowany z opóźnieniem
