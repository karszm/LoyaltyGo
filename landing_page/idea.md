Projekt Loyalty Go jest projektem platformy lojalnościowej dla małych i średnich merchantów, umożliwiającym lojalizowanie ich na podstawie realizowanych transakcji przez merchantów. 

Przykład. 
Karol jest klientem gabinetu stomatologicznego, w którym realizowane są i przyjmowane płatności za pomocą soft posów. W oprogramowaniu Soft Posa możliwe są dwie akcje: zaproszenie do programu lojalnościowego polegające na wyświetleniu QR-kodu. Oraz zeskanowanie kodu lojalnościowego klienta. 

W przypadku, kiedy klient nie jest w programie lojalnościowym, skanuje on za pomocą aparatu QR-kod zapraszający do programu lojalnościowego, który w efekcie dodaje do jego aplikacji Wallet dedykowaną kartę lojalnościową.

Podczas onboardingu musi podać swoje imię, nazwisko, adres mailowy i tyle. Karta lojalnościowa ląduje w jego aplikacji Wallet, gdzie będzie widział nazwę tej firmy, punkty, które do tej pory zebrał, oraz oferty. 

W przypadku, kiedy klient posiada kartę lojalnościową, uruchamia aplikację Wallet oraz przedstawia QR-kod karty lojalnościowej, a merchant na softbosie klika na przycisk „Skanuj kod lojalnościowy”, który skanuje tę kartę. Jeżeli klient posiada ofertę specjalną, np. rabat 35% na usługi w środę, merchant musi sam na kasie zastosować ten rabat oraz wprowadzić go w SOST POS-ie, tak żeby kwota transakcji się zgadzała.

Tym samym oferta zostaje wykorzystana. 

Klient nie posiada żadnej innej aplikacji poza walletem i swoją kartą lojalnościową. 
Merchant posiada do dyspozycji SoftPosa, który nie jest częścią tego projektu, oraz panel Merchanta, gdzie widzi tak naprawdę swoich klientów lojalnościowych, zlojalizowanych.

Ma prosty kreator karty lojalnościowej wraz z możliwością dodawania ofert specjalnych. 

Celem projektu jest stworzenie czterech podprojektów.
1. Aplikacja backendowa oparta o Supabase.  
2. Lekki front-end zintegrowany z back-endem Supabase. Jest to aplikacja przeznaczona dla merczantów. 
3. Landing page, mówiący o produkcie oraz umożliwiający przekierowanie go do aplikacji Merchanta. 
4. SDK dla platformy iOS, umożliwiające wygenerowanie QR kodu do zapraszania do programu lojalnościowego. Oraz do skanowania karty lojalnościowej, która następnie będzie zintegrowana z aplikacją SoftPosa. 

Pierwsza wersja tej aplikacji ma być maksymalnie prosta i pokazywać techniczną możliwość zrealizowania tego projektu. 
W pierwszej wersji produktu nie będziemy implementować całej logiki związanej z wystawianiem kart; tylko zintegrujemy się z usługą passkit.com. 