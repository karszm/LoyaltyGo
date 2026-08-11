# language: pl

Funkcja: Landing page produktu
  Jako właściciel małej firmy szukający prostego programu lojalnościowego
  Chcę zrozumieć, czym jest LoyaltyGo i jednym kliknięciem założyć konto
  Aby zacząć bez rozmowy handlowej i bez wdrożenia

  Założenia:
    Zakładając, że landing page opisuje produkt i kieruje merchanta do panelu
    Oraz landing page nie zbiera żadnych danych klientów końcowych

  Scenariusz: Zapoznanie się z produktem
    Zakładając, że wchodzę na landing page LoyaltyGo
    Wtedy widzę, na czym polega produkt: karta w portfelu klienta, obsługa z poziomu SoftPOS, panel merchanta
    Oraz widzę, czego produkt nie wymaga: aplikacji dla klienta i nowego sprzętu
    Oraz widzę wezwanie do założenia konta

  Scenariusz: Przejście do zakładania konta
    Gdy klikam "Zacznij"
    Wtedy trafiam na ekran logowania panelu merchanta
    Oraz mogę wejść linkiem jednorazowym albo kontem Google lub Apple

  Scenariusz: Powrót zalogowanego merchanta
    Zakładając, że mam aktywną sesję w panelu
    Gdy wchodzę na landing page i klikam "Zacznij"
    Wtedy trafiam prosto do panelu, z pominięciem ekranu logowania

  Scenariusz: Landing page na telefonie
    Zakładając, że otwieram landing page na telefonie
    Wtedy treść i wezwanie do działania są czytelne bez powiększania
    Oraz założenie konta działa tak samo jak na komputerze

  @corner
  Scenariusz: Klient końcowy trafia na landing page zamiast na zaproszenie
    Zakładając, że jestem klientem, nie merchantem
    Gdy wchodzę na landing page szukając swojej karty lojalnościowej
    Wtedy widzę wyjaśnienie, że kartę wydaje konkretna firma przez swój kod QR
    Oraz nie mam możliwości założenia konta klienta, bo takie nie istnieje

  @corner @poza-v1
  Scenariusz: Brak informacji cenowych
    Gdy szukam na landing page cennika
    Wtedy nie znajduję go
    Ponieważ v1 nie ma płatności ani planów cenowych
