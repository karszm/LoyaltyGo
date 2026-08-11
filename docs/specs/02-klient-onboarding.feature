# language: pl

Funkcja: Dołączenie klienta do programu lojalnościowego
  Jako klient merchanta
  Chcę dołączyć do programu i mieć kartę w portfelu telefonu
  Aby zbierać punkty i korzystać z ofert bez instalowania jakiejkolwiek aplikacji

  Założenia:
    Zakładając, że merchant "Salon Le Perle" ma opublikowany program lojalnościowy
    Oraz merchant prezentuje statyczny kod QR zapraszający — na ekranie SoftPOS lub w formie wydruku
    Oraz jedynym narzędziem klienta jest telefon z Apple Wallet lub Google Wallet

  # ------------------------------------------------------------------
  # Ścieżka podstawowa
  # ------------------------------------------------------------------

  Scenariusz: Dołączenie do programu na iPhonie
    Zakładając, że nie należę do programu "Salon Le Perle"
    Gdy skanuję aparatem kod QR zaproszenia
    Oraz otwieram stronę onboardingową
    Oraz podaję imię, nazwisko i adres e-mail
    Oraz akceptuję zgodę na przetwarzanie danych
    Oraz zatwierdzam formularz
    Wtedy dostaję kartę lojalnościową do dodania do Apple Wallet
    Oraz na karcie widzę nazwę i branding merchanta, saldo 0 punktów oraz sekcję ofert

  Scenariusz: Dołączenie do programu na Androidzie
    Zakładając, że korzystam z telefonu z Androidem
    Gdy przechodzę onboarding
    Wtedy dostaję kartę do dodania do Google Wallet
    Oraz zawartość karty jest równoważna wersji dla Apple Wallet

  @corner
  Scenariusz: Otwarcie linku zaproszenia na komputerze
    Zakładając, że otwieram link zaproszenia w przeglądarce na komputerze
    Gdy strona wykryje brak obsługi portfela
    Wtedy widzę komunikat, że kartę dodaje się na telefonie
    Oraz mogę wysłać sobie link na adres e-mail
    Ale członkostwo nie zostaje założone bez wypełnienia formularza

  # ------------------------------------------------------------------
  # Walidacja danych i przerwanie procesu
  # ------------------------------------------------------------------

  @corner
  Scenariusz: Niepoprawny adres e-mail w formularzu
    Zakładając, że jestem na stronie onboardingowej
    Gdy podaję adres "karol@" i zatwierdzam formularz
    Wtedy widzę komunikat walidacyjny przy polu adresu
    Oraz członkostwo nie zostaje założone

  @corner
  Scenariusz: Brak zgody na przetwarzanie danych
    Zakładając, że wypełniłem wszystkie pola
    Gdy nie zaznaczam zgody i zatwierdzam formularz
    Wtedy widzę informację, że zgoda jest wymagana do wydania karty
    Oraz karta nie zostaje wydana

  @corner
  Scenariusz: Porzucenie formularza
    Zakładając, że zacząłem wypełniać formularz
    Gdy zamykam stronę przed zatwierdzeniem
    Wtedy nie powstaje żadne członkostwo
    Oraz podane dane nie są zapisywane

  @corner
  Scenariusz: Dwukrotne zatwierdzenie tego samego formularza
    Zakładając, że wypełniłem formularz onboardingowy
    Gdy klikam przycisk zatwierdzenia dwa razy pod rząd
    Wtedy powstaje dokładnie jedno członkostwo
    Oraz otrzymuję dokładnie jedną kartę

  # ------------------------------------------------------------------
  # Ponowne dołączenie i odzyskanie karty
  # ------------------------------------------------------------------

  Scenariusz: Ponowne zeskanowanie zaproszenia przez istniejącego członka
    Zakładając, że należę już do programu "Salon Le Perle" z adresem "karol@example.com"
    Oraz mam na koncie 180 punktów
    Gdy ponownie skanuję kod QR zaproszenia i podaję ten sam adres e-mail
    Wtedy system rozpoznaje istniejące członkostwo
    Oraz dostaję ponownie tę samą kartę, z saldem 180 punktów
    Ale nie powstaje drugie członkostwo ani drugie saldo

  # ------------------------------------------------------------------
  # Odzyskiwanie karty
  # ------------------------------------------------------------------
  # Strona zaproszenia ma obok formularza przycisk "Odzyskaj kartę".
  # Ścieżka odzyskiwania wymaga wyłącznie adresu e-mail i dotyczy zawsze
  # jednego, konkretnego merchanta — tego, którego zaproszenie zeskanowano.

  Scenariusz: Odzyskanie karty na nowym telefonie
    Zakładając, że mam nowy telefon bez karty lojalnościowej
    Oraz należę do programu "Salon Le Perle" z adresem "karol@example.com"
    Oraz mam tam 180 punktów i jeden niezrealizowany kupon
    Gdy skanuję kod QR zaproszenia i wybieram "Odzyskaj kartę"
    Oraz podaję adres "karol@example.com"
    Wtedy widzę komunikat, żebym sprawdził swoją skrzynkę
    Oraz dostaję wiadomość z linkiem do mojej karty w programie "Salon Le Perle"
    Gdy otwieram link na telefonie
    Wtedy dodaję kartę do portfela z saldem 180 punktów i zachowanym kuponem
    Oraz nie podaję przy tym żadnych danych osobowych

  Scenariusz: Odzyskanie karty usuniętej z portfela
    Zakładając, że skasowałem kartę z portfela na tym samym telefonie
    Gdy korzystam ze ścieżki odzyskiwania
    Wtedy odzyskuję tę samą kartę, z tym samym saldem i tymi samymi ofertami

  @corner @bezpieczenstwo
  Scenariusz: Odzyskiwanie na adres bez członkostwa nie ujawnia stanu konta
    Zakładając, że adres "ktos@example.com" nie należy do programu "Salon Le Perle"
    Gdy wybieram "Odzyskaj kartę" i podaję ten adres
    Wtedy widzę ten sam komunikat co zawsze: sprawdź swoją skrzynkę
    Ale żadna wiadomość z kartą nie zostaje wysłana
    Oraz odpowiedź nie ujawnia, czy ten adres należy do programu

  @corner @bezpieczenstwo
  Scenariusz: Odzyskiwanie dotyczy wyłącznie merchanta z zeskanowanego zaproszenia
    Zakładając, że z adresem "karol@example.com" należę do programów "Salon Le Perle" i "Kawiarnia Dobra"
    Gdy odzyskuję kartę ze strony zaproszenia "Salon Le Perle"
    Wtedy dostaję link wyłącznie do karty "Salon Le Perle"
    Oraz wiadomość nie ujawnia mojego członkostwa w innym programie

  @corner @bezpieczenstwo @zalozenie
  Scenariusz: Wygaśnięcie linku do odzyskanej karty
    Zakładając, że dostałem wiadomość z linkiem do karty ponad 24 godziny temu
    Gdy otwieram ten link
    Wtedy widzę komunikat, że link wygasł
    Oraz mogę uruchomić odzyskiwanie ponownie ze strony zaproszenia

  Scenariusz: Dodanie karty na dwóch telefonach z jednego linku
    Zakładając, że mam ważny link do mojej karty
    Gdy otwieram go na dwóch swoich telefonach
    Wtedy karta jest dodana w obu portfelach
    Oraz oba egzemplarze pokazują to samo saldo i te same oferty
    Ponieważ obie karty wskazują na jedno członkostwo

  @corner @bezpieczenstwo
  Scenariusz: Ograniczenie częstotliwości odzyskiwania
    Zakładając, że przed chwilą uruchomiłem odzyskiwanie karty
    Gdy natychmiast próbuję ponownie
    Wtedy widzę informację, ile muszę odczekać
    Oraz liczba wiadomości wysyłanych na jeden adres jest ograniczona w czasie

  @corner
  Scenariusz: Odzyskiwanie, gdy karta nie została jeszcze wydana
    Zakładając, że moje członkostwo istnieje, ale wydanie karty utknęło na awarii wystawcy
    Gdy uruchamiam odzyskiwanie karty
    Wtedy widzę komunikat, że karta jest przygotowywana
    Oraz dostaję wiadomość z linkiem, gdy tylko wydanie się powiedzie

  @corner
  Scenariusz: Odzyskiwanie w zawieszonym lub zamkniętym programie
    Zakładając, że merchant zawiesił swój program
    Gdy próbuję odzyskać kartę
    Wtedy widzę komunikat, że program jest chwilowo niedostępny
    Oraz link do karty nie jest wysyłany

  @corner
  Scenariusz: Ten sam adres e-mail u dwóch różnych merchantów
    Zakładając, że z adresem "karol@example.com" należę do programu "Salon Le Perle"
    Gdy dołączam z tym samym adresem do programu "Kawiarnia Dobra"
    Wtedy powstaje odrębne, niezależne członkostwo
    Oraz w portfelu mam dwie osobne karty
    Oraz punkty i oferty obu programów są całkowicie rozdzielne
    Oraz żaden z merchantów nie widzi danych klienta z drugiego programu

  @corner
  Scenariusz: Zmiana danych osobowych przy ponownym dołączeniu
    Zakładając, że należę do programu jako "Karol Nowak"
    Gdy ponownie przechodzę onboarding z tym samym adresem, ale nazwiskiem "Karol Kowalski"
    Wtedy dane na moim członkostwie zostają zaktualizowane
    Oraz saldo punktów pozostaje bez zmian

  # ------------------------------------------------------------------
  # Program niedostępny
  # ------------------------------------------------------------------

  @corner
  Scenariusz: Zaproszenie do programu, który nie został opublikowany
    Zakładając, że merchant nie dokończył konfiguracji programu
    Gdy skanuję kod QR zaproszenia
    Wtedy widzę komunikat, że program jest chwilowo niedostępny
    Oraz nie podaję żadnych danych osobowych

  @corner
  Scenariusz: Zaproszenie do programu zawieszonego lub zamkniętego
    Zakładając, że merchant zamknął swój program
    Gdy skanuję kod QR zaproszenia
    Wtedy widzę komunikat, że program został zakończony
    Oraz karta nie zostaje wydana

  # ------------------------------------------------------------------
  # Awaria wystawcy kart
  # ------------------------------------------------------------------

  @corner
  Scenariusz: Chwilowa awaria wystawcy kart podczas onboardingu
    Zakładając, że poprawnie wypełniłem formularz
    Gdy wystawca kart nie odpowiada
    Wtedy widzę komunikat, że karta jest przygotowywana
    Oraz moje członkostwo jest już założone
    Oraz dostaję link do karty na adres e-mail, gdy tylko wydanie się powiedzie

  # ------------------------------------------------------------------
  # Życie karty po dołączeniu
  # ------------------------------------------------------------------

  Scenariusz: Dołączenie do programu w trakcie wizyty
    Zakładając, że jestem u merchanta i płacę za usługę
    Gdy merchant pokazuje mi kod QR zaproszenia
    Oraz kończę onboarding i dodaję kartę do portfela
    Oraz okazuję świeżo wydaną kartę do zeskanowania
    Wtedy bieżąca transakcja zostaje zaliczona na moje konto
    Oraz od razu widzę pierwsze punkty na karcie

  @corner
  Scenariusz: Karta nie zdążyła się wydać przed końcem płatności
    Zakładając, że rozpocząłem onboarding przy kasie
    Gdy wydanie karty się opóźnia, a płatność zostaje już zakończona
    Wtedy moje członkostwo istnieje, ale bieżąca transakcja nie jest do niego przypisana
    Oraz zaczynam zbierać punkty od kolejnej wizyty

  Scenariusz: Aktualizacja salda punktów na karcie po transakcji
    Zakładając, że mam kartę z saldem 100 punktów
    Gdy merchant rejestruje moją transakcję na 200 zł przy przeliczniku "10 punktów za 100 zł"
    Wtedy saldo w systemie merchanta wynosi 120 punktów
    Oraz saldo na karcie w portfelu pokazuje 120 punktów po synchronizacji z wystawcą kart
    Oraz karta jest tylko odzwierciedleniem stanu z backendu, nigdy jego źródłem

  Scenariusz: Widoczność ofert na karcie
    Zakładając, że merchant utworzył ofertę "Rabat 25% na strzyżenie"
    Gdy otwieram kartę w portfelu
    Wtedy widzę tę ofertę wśród dostępnych

  @corner @poza-v1
  Scenariusz: Klient nie ma możliwości samodzielnego wypisania się z programu
    Zakładając, że chcę zrezygnować z programu
    Gdy usuwam kartę z portfela
    Wtedy karta znika z mojego telefonu
    Ale moje członkostwo i punkty pozostają w systemie merchanta
    Oraz żądanie usunięcia danych obsługiwane jest poza aplikacją, kontaktem z merchantem
