# Srub Podkozí — firemní stravování

## Aktuální jednoduchý tok pro firmy

Firma používá pouze tři sekce: **Jídelníček**, **Souhrn** a **Účet**. V jídelníčku vybere den, klikne na „Objednat“, zvolí počet porcí a potvrdí. Souhrn ukazuje pracovní týden včetně jídel, celkové ceny a dnů, kde ještě objednávka chybí.

Samostatná aplikace pro restauraci a objednávající firmy. Node.js 24, SQLite, HTML/CSS/JavaScript. Žádné externí runtime balíčky. Data jsou uložená na serveru, nikoliv jen v prohlížeči.

## Místní spuštění

1. Nainstalujte Node.js 24 nebo novější.
2. Zkopírujte `.env.example` do `.env`.
3. `npm start` — otevřete http://127.0.0.1:3020.
4. `npm test` a `npm run check` spouštějí ověření.

Demo běží jen na localhost, neodesílá e-maily, obsahuje fiktivní firmy a přepis dodaného menu 7.–11. 9. 2026. Firmy mají ukázkové sjednané ceny; nejsou to skutečné dohody restaurace. Vstupní obrazovka obsahuje tlačítka pro obě role. Přihlášení: `restaurace@demo.cz` nebo `firma@demo.cz`, heslo `SrubDemo2026!`.

## Hotové funkce

- Přihlášení, role, oddělení dat firem, změna hesla a odhlášení.
- Vytvoření / úprava / pozastavení firmy, reset hesla správcem.
- Firemní cena hlavního jídla i polévky; prázdná cena použije menu.
- Vlastní a jednorázové krabičky s příplatkem za každou porci (i polévku).
- Polévka a hlavní jídla: den, název, příloha, alergeny a cena.
- Ruční editace jídel, import CSV s náhledem a vzorem. Uživatelův obrázek je ručně přepsaný; automatické OCR není implementované.
- Počet porcí, potvrzení / úprava / zrušení položek do uzávěrky. 0 porcí odstraní objednanou položku.
- Pevná uzávěrka od 8:00 Europe/Prague, po 11:00 se neotevírá. Platí i pro změny a rušení. Budoucí dny zůstávají otevřené.
- Cena a krabičky se při první objednávce uloží jako snapshot; pozdější změna ceníku je nepřepíše.
- Denní přehled kuchyně, rozdělení pro rozvoz, tisk a stažení textového souhrnu.
- Serverový plánovač po 8:00 vytvoří souhrn; po restartu daný den ho doplní. Pro automatické odesílání musí server trvale běžet. Zmeškané předchozí dny automaticky nerozesílá.
- E-mailová integrace Resend s idempotencí a opakováním při chybě. Vyžaduje připojení služby; místní demo zprávy nikdy neodesílá.

## Soubor CSV

UTF-8, středník jako oddělovač, přesná hlavička:

```csv
datum;nazev;popis;alergeny;cena;typ
2026-09-14;Hovězí vývar;Maso, nudle, zelenina;1, 3, 9, 12;60;Polévka
2026-09-14;Kuřecí řízek;Bramborová kaše;1, 3, 7;165;Hlavní jídlo
```

Import přidává jídla, nenahrazuje existující menu. Duplicitní opakovaný import vytvoří další položky. Objednané jídlo nelze upravit ani smazat, aby se firmám nezměnil potvrzený oběd.

## Nasazení pro skutečné firmy

Použijte vlastní VPS / trvale běžící Node službu s persistentním diskem. SQLite není určeno pro více souběžných instancí této aplikace ani do ephemeral serverless prostředí.

1. Vytvořte NOVOU prázdnou složku `DATA_DIR`. Demo databázi neměňte na produkční (aplikace záměnu odmítne).
2. Nastavte `DEMO=false`, `ADMIN_EMAIL`, silné `ADMIN_PASSWORD` (12–128 znaků). Admin vznikne pouze při prázdné databázi. Po vytvoření bootstrap heslo odeberte z prostředí.
3. Nastavte `APP_ORIGIN=https://…`, `COOKIE_SECURE=true`, ponechte `HOST=127.0.0.1` a zapojte HTTPS reverse proxy. Vynucujte HTTPS; Node port nevystavujte na internet.
4. Node proces provozujte jako samostatného uživatele pod správcem služeb s automatickým restartem. Omezte práva `.env` a databáze, nastavte firewall, monitoring procesu a chyb e-mailu. Limity pokusů přihlášení doplňte omezením provozu na reverse proxy.
5. Pro souhrny nastavte `RESEND_API_KEY`, `MAIL_FROM` z ověřené domény a v aplikaci e-mail příjemce. Nastavte SPF/DKIM dle poskytovatele. Dokumentace: https://resend.com/docs/api-reference/emails/send-email. Odeslání se neověřovalo bez skutečných přístupů.
6. Zadejte aktuální jídelník, firmy a dohodnuté ceny. Před provozem restaurace ověří přepis jídel a alergenů vůči originálu.
7. Denně zálohujte databázi. Nejjednodušší konzistentní záloha: zastavte službu, zkopírujte celý `DATA_DIR` včetně WAL/SHM, spusťte službu. Uchovejte 14 denních záloh a jednu šifrovanou kopii mimo server. Obnovu ověřte v samostatné testovací složce. Nikdy nekopírujte pouze hlavní sqlite soubor za běhu WAL databáze.
8. Při obnově zastavte službu, obnovte celou zálohovanou složku, ověřte přihlášení, počet objednávek a ceny. E-mailovou službu nechte v testu odpojenou.

## K doladění před ostrým provozem

- Schválení paušálních firemních cen versus individuální ceny každého konkrétního jídla. Aktuální varianta: jedna sjednaná cena hlavních jídel a jedna polévek.
- Jestli se krabička účtuje zvlášť také u polévky (aktuálně ano).
- Finální formát importu; OCR fotek/PDF není součástí této verze.
- Jedna firma = jeden sdílený firemní účet; individuální účty zaměstnanců nejsou součástí této verze.
- Obnovu zapomenutého hesla firmy provádí správce; samoobslužný reset e-mailem není implementován. Obnova admina vyžaduje správu serveru.
- E-mailová služba, příjemce souhrnu, doména a hosting nejsou dodané ani nasazené.
- Neobsahuje platby, fakturaci ani účetní export.

## Zabezpečení

Hesla: scrypt s unikátní solí. Session: náhodný token, SHA-256 hash v DB, HttpOnly/SameSite=Strict cookie, expirace 12 hodin. Všechny API mutace ověřují Origin a JSON Content-Type. Role a vlastnictví kontroluje server; neaktivní firma ztrácí přístup. Prepared statements, transakce pro objednávky/import, serverová uzávěrka a validace množství. Neověřené vstupy se při zobrazení HTML escapují. Statické soubory jsou whitelistované. Bez externích fontů, analytiky a trackerů.

Vizuální reference: www.srubpodkozi.cz a obrázek menu dodaný uživatelem. Ikona srubu je jednoduchá vlastní SVG ilustrace, nikoliv originální logo restaurace.

## Automatizovaná online záloha

`npm run backup` vytvoří konzistentní zálohu i za běhu aplikace, zkontroluje integritu a uchová posledních 14 dní. Složku nastavuje `BACKUP_DIRECTORY`, retenci `BACKUP_RETENTION_DAYS`. Pro denní provoz naplánujte příkaz v systemd timeru (stejně jako u fitness aplikace). Žádný systémový plánovač zatím nebyl na tomto počítači instalován. Záloha nesmí být jediná kopie na stejném disku.

Převzaté části z předchozí aplikace jsou popsané v REUSE.md.
