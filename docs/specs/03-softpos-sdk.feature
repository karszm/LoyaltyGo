# language: pl

Funkcja: Obsługa lojalności na kasie przez SDK iOS
  Jako merchant obsługujący klienta na SoftPOS
  Chcę zaprosić klienta do programu i rejestrować jego transakcje jednym gestem
  Aby lojalność nie wydłużała obsługi przy kasie

  Założenia:
    Zakładając, że aplikacja SoftPOS ma wbudowane SDK LoyaltyGo dla iOS
    Oraz SDK jest zainicjowane kluczem programu merchanta, pobranym przez merchanta z panelu
    Oraz projekt nie integruje się z terminalami ani kasami fiskalnymi — całość dzieje się w aplikacji SoftPOS
    Oraz mój program lojalnościowy jest opublikowany

  # Kontrakt rejestracji transakcji, obowiązujący w całym pliku:
  #   - transaction_id     : numer transakcji nadany przez SoftPOS; SoftPOS gwarantuje jego
  #                          unikalność i to on jest kluczem idempotencji, w zakresie merchanta
  #   - amount             : kwota po rabacie, w PLN, większa od zera
  #   - coupon_ids         : opcjonalna lista kuponów do skonsumowania w tej transakcji
  #   - metadata           : dane opisowe SoftPOS przekazywane do historii; nie wpływają na
  #                          naliczanie punktów ani na konsumpcję kuponów
  #   - odpowiedź          : wewnętrzny identyfikator transakcji LoyaltyGo (UUID nadany przez
  #                          backend), naliczone punkty, saldo po operacji, wynik konsumpcji kuponów
  #   - punkty             : kwota razy przelicznik merchanta, zaokrąglane w dół do pełnego punktu
  #   - okno kontekstu     : dane zeskanowanej karty są ważne 10 minut od skanu

  # ------------------------------------------------------------------
  # Zaproszenie do programu
  # ------------------------------------------------------------------

  Scenariusz: Wyświetlenie kodu QR zaproszenia
    Gdy wybieram akcję "Pokaż zaproszenie"
    Wtedy SDK wyświetla kod QR ze statycznym linkiem mojego programu
    Oraz klient może zeskanować go aparatem własnego telefonu

  @corner
  Scenariusz: Zaproszenie przy nieopublikowanym programie
    Zakładając, że mój program nie został opublikowany
    Gdy wybieram akcję "Pokaż zaproszenie"
    Wtedy SDK pokazuje komunikat, że program wymaga dokończenia konfiguracji w panelu
    Oraz nie wyświetla kodu QR

  Scenariusz: Klient dołącza w trakcie obsługi i od razu okazuje kartę
    Zakładając, że klient nie należał do programu
    Gdy pokazuję mu kod QR zaproszenia
    Oraz klient kończy onboarding i dodaje kartę do portfela
    Oraz skanuję jego świeżo wydaną kartę
    Wtedy SDK identyfikuje go jako członka z saldem 0 punktów
    Oraz mogę zarejestrować bieżącą transakcję na jego konto

  @corner
  Scenariusz: Karta klienta nie jest jeszcze gotowa
    Zakładając, że klient ukończył onboarding, ale wydanie karty się opóźnia
    Gdy próbuję zeskanować jego kartę
    Wtedy nie mam czego zeskanować
    Oraz bieżąca transakcja nie zostaje przypisana do żadnego członka
    Oraz klient zaczyna zbierać punkty od kolejnej wizyty

  # ------------------------------------------------------------------
  # Skanowanie karty lojalnościowej
  # ------------------------------------------------------------------

  Scenariusz: Skan karty istniejącego członka
    Zakładając, że klient okazuje kartę lojalnościową z portfela
    Gdy wybieram akcję "Skanuj kod lojalnościowy"
    Wtedy SDK identyfikuje członka
    Oraz zwraca imię i nazwisko, saldo punktów oraz listę dostępnych ofert

  @corner
  Scenariusz: Skan karty wydanej przez innego merchanta
    Zakładając, że klient okazuje kartę programu "Kawiarnia Dobra"
    Gdy skanuję ten kod na swojej kasie
    Wtedy SDK zwraca błąd "karta spoza tego programu"
    Oraz nie ujawnia żadnych danych klienta ani jego salda
    Oraz nie powstaje żadna transakcja

  @corner
  Scenariusz: Kod nieczytelny lub niebędący kartą lojalnościową
    Gdy skanuję uszkodzony kod albo dowolny inny kod QR
    Wtedy SDK zwraca błąd rozpoznania kodu
    Oraz proponuje ponowny skan
    Oraz płatność na SoftPOS przebiega normalnie, bez lojalności

  @corner
  Scenariusz: Skan karty członka zablokowanego przez merchanta
    Zakładając, że zablokowałem członkostwo klienta w panelu
    Gdy skanuję jego kartę
    Wtedy SDK zwraca informację o nieaktywnym członkostwie
    Oraz nie da się zarejestrować transakcji ani skonsumować kuponu

  @corner @zalozenie
  Scenariusz: Klient okazuje starszy egzemplarz swojej karty
    Zakładając, że klient odzyskał kartę na nowym telefonie, a stara karta została na poprzednim
    Gdy skanuję starszy egzemplarz karty
    Wtedy SDK identyfikuje to samo członkostwo i to samo saldo
    Oraz transakcja jest rejestrowana normalnie
    Ponieważ obie karty wskazują na jedno członkostwo

  @corner @bezpieczenstwo
  Scenariusz: Nieważny lub cofnięty klucz programu
    Zakładając, że klucz, którym zainicjowano SDK, został unieważniony w panelu
    Gdy wykonuję jakąkolwiek operację lojalnościową
    Wtedy SDK zwraca błąd uwierzytelnienia
    Oraz nie zwraca żadnych danych klienta
    Oraz operacja nie trafia do kolejki offline

  # ------------------------------------------------------------------
  # Rejestracja transakcji
  # ------------------------------------------------------------------

  Scenariusz: Rejestracja transakcji i naliczenie punktów
    Zakładając, że zeskanowałem kartę klienta z saldem 100 punktów
    Oraz mój przelicznik to "10 punktów za każde 100 zł"
    Gdy SoftPOS wywołuje rejestrację transakcji z kwotą 250.00 zł i identyfikatorem "TX-1001"
    Wtedy klient otrzymuje 25 punktów
    Oraz jego saldo wynosi 125 punktów
    Oraz SDK zwraca wewnętrzny identyfikator transakcji LoyaltyGo
    Oraz transakcja jest widoczna w panelu merchanta
    Oraz karta w portfelu klienta pokazuje zaktualizowane saldo po synchronizacji

  Scenariusz: Idempotencja rejestracji transakcji
    Zakładając, że transakcja "TX-1001" została już zarejestrowana w moim programie
    Gdy SoftPOS ponawia wywołanie z tym samym identyfikatorem "TX-1001"
    Wtedy punkty nie są naliczane po raz drugi
    Oraz SDK zwraca wynik pierwotnej rejestracji, z tym samym wewnętrznym identyfikatorem
    Oraz w historii widnieje jeden wpis

  Scenariusz: Ten sam numer transakcji u dwóch różnych merchantów
    Zakładając, że transakcja "TX-1001" istnieje w programie innego merchanta
    Gdy rejestruję w swoim programie transakcję o identyfikatorze "TX-1001"
    Wtedy transakcja jest zarejestrowana normalnie
    Ponieważ idempotencja obowiązuje w zakresie pojedynczego merchanta

  @corner
  Scenariusz: Rejestracja transakcji bez wcześniejszego skanu karty
    Zakładając, że nie zeskanowałem żadnej karty
    Gdy SoftPOS wywołuje rejestrację transakcji
    Wtedy SDK zwraca błąd braku zidentyfikowanego członka
    Oraz transakcja nie jest przypisana do nikogo

  @corner
  Szablon scenariusza: Walidacja parametrów transakcji
    Zakładając, że zeskanowałem kartę klienta
    Gdy SoftPOS wywołuje rejestrację transakcji z parametrem <parametr> o wartości <wartosc>
    Wtedy SDK zwraca błąd walidacji "<blad>"
    Oraz punkty nie są naliczane

    Przykłady:
      | parametr       | wartosc | blad                              |
      | kwota          | 0.00    | kwota musi być większa od zera    |
      | kwota          | -50.00  | kwota musi być większa od zera    |
      | transaction_id | pusty   | identyfikator transakcji wymagany |

  @corner
  Scenariusz: Wygaśnięcie kontekstu zeskanowanej karty
    Zakładając, że zeskanowałem kartę klienta
    Gdy od skanu minęło ponad 10 minut
    Oraz SoftPOS wywołuje rejestrację transakcji
    Wtedy SDK zwraca błąd wygasłego kontekstu
    Oraz wymaga ponownego zeskanowania karty

  @corner
  Scenariusz: Sprzeczne dane w metadanych
    Zakładając, że zeskanowałem kartę klienta
    Gdy SoftPOS przekazuje w metadanych inną kwotę niż w polu kwoty transakcji
    Wtedy punkty naliczają się wyłącznie od pola kwoty
    Oraz metadane trafiają do historii bez wpływu na wynik

  # ------------------------------------------------------------------
  # Tryb offline
  # ------------------------------------------------------------------

  @offline
  Scenariusz: Rejestracja transakcji bez dostępu do sieci
    Zakładając, że kasa nie ma połączenia z internetem
    Oraz zeskanowałem kartę klienta
    Gdy SoftPOS wywołuje rejestrację transakcji "TX-2001"
    Wtedy SDK zapisuje transakcję w lokalnej kolejce
    Oraz informuje, że punkty zostaną naliczone po odzyskaniu połączenia
    Oraz płatność przebiega bez zakłóceń

  @offline
  Scenariusz: Synchronizacja kolejki po odzyskaniu połączenia
    Zakładając, że w kolejce offline czekają trzy transakcje
    Gdy kasa odzyskuje połączenie
    Wtedy SDK wysyła transakcje w kolejności ich wykonania
    Oraz punkty są naliczane z datą wykonania transakcji, nie datą synchronizacji
    Oraz kolejka zostaje opróżniona

  @offline @corner
  Scenariusz: Ponowna wysyłka tej samej transakcji z kolejki
    Zakładając, że transakcja "TX-2001" została wysłana, ale odpowiedź nie dotarła do SDK
    Gdy SDK ponawia wysyłkę tej samej transakcji
    Wtedy backend rozpoznaje identyfikator "TX-2001" jako już przetworzony
    Oraz punkty nie są naliczane podwójnie

  @offline @corner
  Scenariusz: Skan karty nieznanej lokalnie podczas pracy offline
    Zakładając, że kasa nie ma połączenia
    Oraz klient okazuje kartę, której SDK nie ma w pamięci podręcznej
    Gdy skanuję jego kartę
    Wtedy SDK odczytuje identyfikator karty i przyjmuje transakcję do kolejki
    Ale nie pokazuje salda punktów ani ofert
    Oraz informuje, że dane będą dostępne po odzyskaniu połączenia

  @offline @corner
  Scenariusz: Transakcja offline dla karty spoza programu
    Zakładając, że transakcja offline dotyczyła karty innego merchanta
    Gdy kolejka jest synchronizowana
    Wtedy backend odrzuca wpis
    Oraz merchant widzi w panelu odrzuconą synchronizację z powodem
    Oraz punkty nie są naliczane nikomu

  @offline @corner
  Scenariusz: Zmiana przelicznika, zanim kolejka została zsynchronizowana
    Zakładając, że transakcja czeka w kolejce offline
    Gdy merchant zmienia przelicznik punktów przed jej synchronizacją
    Wtedy punkty naliczają się według przelicznika obowiązującego w chwili wykonania transakcji
    Oraz merchant widzi w historii, który przelicznik zastosowano

  @offline @corner @zalozenie
  Scenariusz: Przepełnienie lub przeterminowanie kolejki offline
    Zakładając, że kasa pracuje bez sieci od ośmiu dni
    Gdy kolejka przekracza 500 wpisów albo wpis jest starszy niż 7 dni
    Wtedy najstarsze wpisy są odrzucane
    Oraz odrzucenie jest raportowane merchantowi w panelu
    Oraz merchant jest ostrzegany w SDK o utrzymującym się braku połączenia

  # ------------------------------------------------------------------
  # Zwroty i anulowanie naliczenia
  # ------------------------------------------------------------------

  Scenariusz: Zwrot transakcji objętej programem lojalnościowym
    Zakładając, że transakcja "TX-1001" naliczyła klientowi 25 punktów
    Oraz jest oznaczona flagą użycia w programie lojalnościowym
    Gdy wykonuję na SoftPOS zwrot tej transakcji
    Oraz SoftPOS wywołuje metodę SDK anulującą naliczenie punktów dla "TX-1001"
    Wtedy 25 punktów zostaje cofniętych klientowi
    Oraz transakcja ma w panelu status "anulowana"
    Oraz karta w portfelu klienta pokazuje obniżone saldo po synchronizacji

  @corner
  Scenariusz: Zwrot transakcji bez flagi lojalnościowej
    Zakładając, że transakcja nie była powiązana z kartą lojalnościową
    Gdy wykonuję jej zwrot
    Wtedy SoftPOS nie wywołuje anulowania naliczenia
    Oraz saldo klienta pozostaje bez zmian

  @corner
  Scenariusz: Anulowanie naliczenia poniżej zera
    Zakładając, że klient ma saldo 10 punktów
    Oraz anulowana transakcja naliczyła mu wcześniej 25 punktów
    Gdy anulowanie jest przetwarzane
    Wtedy saldo klienta wynosi 0 punktów
    Oraz różnica jest odnotowana w historii jako korekta
    Ale saldo nigdy nie jest ujemne

  @corner
  Scenariusz: Powtórne anulowanie tej samej transakcji
    Zakładając, że transakcja "TX-1001" została już anulowana
    Gdy SoftPOS ponownie wywołuje anulowanie dla "TX-1001"
    Wtedy operacja jest ignorowana jako już wykonana
    Oraz punkty nie są odejmowane po raz drugi

  @corner
  Scenariusz: Anulowanie nieznanej transakcji
    Gdy SoftPOS wywołuje anulowanie dla identyfikatora, którego nie ma w systemie
    Wtedy SDK zwraca błąd "transakcja nieznana"
    Oraz żadne saldo nie jest modyfikowane

  @corner @poza-v1
  Scenariusz: Zwrot częściowy
    Zakładając, że merchant zwraca klientowi część kwoty transakcji
    Gdy SoftPOS wywołuje anulowanie naliczenia
    Wtedy anulowana jest cała transakcja lojalnościowa, bez proporcjonalnej korekty
    Oraz częściowe korekty punktów są poza zakresem v1

  @offline @corner
  Scenariusz: Zwrot wykonany, zanim pierwotna transakcja opuściła kolejkę offline
    Zakładając, że transakcja "TX-2001" czeka w kolejce offline
    Gdy wykonuję jej zwrot na tej samej kasie
    Wtedy SDK usuwa wpis z kolejki zamiast wysyłać go i natychmiast anulować
    Oraz punkty nigdy nie zostają naliczone
