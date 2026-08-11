# language: pl

Funkcja: Prezentacja i realizacja ofert specjalnych
  Jako merchant przy kasie
  Chcę widzieć kupony klienta po zeskanowaniu jego karty i świadomie je realizować
  Aby rabat trafił do właściwej osoby i został rozliczony dokładnie raz

  Założenia:
    Zakładając, że oferty w v1 to kupony jednorazowe na klienta
    Oraz oferta jest dostępna dla wszystkich członków programu, dopóki merchant jej nie dezaktywuje
    Oraz rabat nalicza merchant ręcznie w SoftPOS, tak aby kwota transakcji się zgadzała
    Oraz kupon jest konsumowany dopiero w momencie rejestracji transakcji, atomowo, przez przekazanie jego identyfikatora
    Oraz wskazanie kuponu przy skanie jest wyłącznie deklaracją intencji i niczego jeszcze nie zużywa

  # ------------------------------------------------------------------
  # Ścieżka podstawowa
  # ------------------------------------------------------------------

  Scenariusz: Realizacja kuponu przy transakcji
    Zakładając, że klient jest członkiem programu
    Oraz aktywna jest oferta "Rabat 25% na strzyżenie"
    Oraz klient nie realizował jeszcze tej oferty
    Gdy skanuję kartę klienta
    Wtedy widzę ofertę na liście dostępnych
    Gdy pytam klienta i wskazuję kupon do realizacji
    Oraz naliczam rabat ręcznie w SoftPOS
    Oraz rejestruję transakcję na kwotę po rabacie, przekazując identyfikator kuponu
    Wtedy kupon jest oznaczony jako wykorzystany w tej samej operacji, w której naliczają się punkty
    Oraz kupon znika z listy ofert klienta
    Oraz punkty naliczają się od kwoty po rabacie
    Oraz w historii transakcja i realizacja kuponu są ze sobą powiązane

  Scenariusz: Klient rezygnuje z kuponu
    Zakładając, że klient ma dostępny kupon
    Gdy pytam o realizację, a klient odmawia
    Oraz rejestruję transakcję bez identyfikatora kuponu
    Wtedy kupon pozostaje dostępny na jego karcie

  Scenariusz: Płatność nie dochodzi do skutku po wskazaniu kuponu
    Zakładając, że wskazałem kupon do realizacji i naliczyłem rabat w SoftPOS
    Gdy klient rezygnuje z zakupu albo płatność zostaje odrzucona
    Oraz transakcja nigdy nie zostaje zarejestrowana
    Wtedy kupon pozostaje dostępny dla klienta
    Oraz nie powstaje żaden ślad realizacji
    Oraz nie ma potrzeby cofania czegokolwiek

  Scenariusz: Klient bez dostępnych ofert
    Zakładając, że merchant nie ma aktywnych ofert
    Gdy skanuję kartę klienta
    Wtedy widzę pustą listę ofert
    Oraz obsługa transakcji przebiega normalnie

  # ------------------------------------------------------------------
  # Jednorazowość i dezaktywacja
  # ------------------------------------------------------------------

  Scenariusz: Kupon jednorazowy na klienta
    Zakładając, że klient zrealizował już ofertę "Rabat 25% na strzyżenie"
    Gdy skanuję jego kartę przy kolejnej wizycie
    Wtedy ta oferta nie jest widoczna wśród dostępnych
    Oraz nie da się jej zrealizować ponownie

  Scenariusz: Ta sama oferta u innego klienta
    Zakładając, że klient A zrealizował ofertę "Rabat 25% na strzyżenie"
    Gdy skanuję kartę klienta B, który jej nie realizował
    Wtedy klient B nadal widzi tę ofertę jako dostępną

  Scenariusz: Oferta utworzona po dołączeniu klienta
    Zakładając, że klient dołączył do programu tydzień temu
    Gdy merchant tworzy nową ofertę
    Wtedy oferta jest dostępna także dla klientów, którzy dołączyli wcześniej
    Oraz pojawia się na ich kartach w portfelu

  @corner
  Scenariusz: Dezaktywacja oferty między skanem a rejestracją transakcji
    Zakładając, że zeskanowałem kartę klienta i widzę ofertę na liście
    Oraz naliczyłem już rabat w SoftPOS
    Gdy w tym samym czasie oferta zostaje dezaktywowana w panelu
    Oraz rejestruję transakcję z identyfikatorem tego kuponu
    Wtedy transakcja zostaje zarejestrowana i punkty naliczone
    Ale kupon nie jest konsumowany
    Oraz SDK zwraca ostrzeżenie "kupon nieaktywny — rabat udzielony poza programem"
    Oraz merchant widzi tę sytuację w historii transakcji

  # ------------------------------------------------------------------
  # Sytuacje współbieżne
  # ------------------------------------------------------------------

  @corner
  Scenariusz: Ten sam kupon zgłoszony równolegle z dwóch urządzeń
    Zakładając, że klient ma jeden dostępny kupon
    Gdy dwie transakcje z identyfikatorem tego samego kuponu docierają równolegle
    Wtedy dokładnie jedna konsumuje kupon
    Oraz druga rejestruje transakcję i punkty, ale dostaje ostrzeżenie "kupon już wykorzystany"
    Oraz w historii istnieje dokładnie jedna realizacja kuponu
    Ale żadna transakcja nie zostaje odrzucona z powodu kuponu

  @corner
  Scenariusz: Ponowienie rejestracji transakcji z kuponem
    Zakładając, że transakcja "TX-1001" skonsumowała kupon
    Gdy SoftPOS ponawia rejestrację tej samej transakcji
    Wtedy kupon nie jest konsumowany po raz drugi
    Oraz SDK zwraca wynik pierwotnej rejestracji, wraz z informacją o zrealizowanym kuponie

  @corner
  Scenariusz: Rejestracja transakcji z kuponem należącym do innego klienta
    Zakładając, że zeskanowałem kartę klienta A
    Gdy rejestruję transakcję z identyfikatorem kuponu przypisanego klientowi B
    Wtedy kupon nie zostaje skonsumowany
    Oraz SDK zwraca błąd niezgodności kuponu z członkiem
    Oraz transakcja jest rejestrowana bez kuponu

  @corner
  Scenariusz: Więcej niż jeden kupon w transakcji
    Zakładając, że klient ma dwa dostępne kupony
    Gdy rejestruję transakcję z identyfikatorami obu kuponów
    Wtedy oba są konsumowane w tej samej operacji
    Ale jeśli którykolwiek jest niedostępny, żaden z nich nie zostaje skonsumowany
    Oraz SDK wskazuje, który kupon zablokował realizację

  # ------------------------------------------------------------------
  # Tryb offline
  # ------------------------------------------------------------------

  @offline @corner
  Scenariusz: Oferty niedostępne bez połączenia
    Zakładając, że kasa nie ma połączenia z internetem
    Gdy skanuję kartę klienta
    Wtedy SDK informuje, że oferty są niedostępne offline
    Oraz nie przyjmuje identyfikatora kuponu przy rejestracji transakcji
    Ale transakcję można zarejestrować i trafia ona do kolejki

  @offline @corner
  Scenariusz: Klient pokazuje kupon na karcie, a kasa jest offline
    Zakładając, że kasa nie ma połączenia
    Oraz klient pokazuje kupon widoczny na karcie w portfelu
    Gdy chcę udzielić rabatu
    Wtedy SDK nie pozwala oznaczyć kuponu jako wykorzystanego
    Oraz decyzja o udzieleniu rabatu poza systemem należy do merchanta
    Oraz kupon pozostaje dostępny do czasu realizacji online

  @offline @corner
  Scenariusz: Utrata połączenia między skanem a rejestracją transakcji
    Zakładając, że zeskanowałem kartę online i widziałem listę kuponów
    Gdy tracę połączenie przed rejestracją transakcji
    Wtedy transakcja trafia do kolejki bez kuponu
    Oraz SDK informuje, że kuponu nie da się rozliczyć w tej transakcji
    Oraz kupon pozostaje dostępny dla klienta

  # ------------------------------------------------------------------
  # Zwroty
  # ------------------------------------------------------------------

  @zalozenie
  Scenariusz: Zwrot transakcji, w której skonsumowano kupon
    Zakładając, że transakcja "TX-1001" skonsumowała kupon "Rabat 25% na strzyżenie"
    Gdy wykonuję zwrot tej transakcji i SDK anuluje naliczenie
    Wtedy punkty z tej transakcji są cofnięte
    Oraz kupon wraca do puli klienta jako dostępny
    Oraz w historii widnieje realizacja i jej wycofanie

  @corner @zalozenie
  Scenariusz: Zwrot transakcji z kuponem dezaktywowanym w międzyczasie
    Zakładając, że kupon skonsumowany w transakcji "TX-1001" należy do oferty dezaktywowanej po tej transakcji
    Gdy wykonuję zwrot tej transakcji
    Wtedy punkty są cofnięte
    Ale kupon nie wraca do puli, bo oferta jest nieaktywna
    Oraz merchant widzi tę sytuację w historii ofert
