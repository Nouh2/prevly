# Setup waitlist Prevly

## 1. Créer le tableur
- Crée un Google Sheet.
- Copie son `spreadsheetId` depuis l'URL.

## 2. Déployer le script
- Ouvre `Extensions > Apps Script`.
- Remplace le contenu par [google-apps-script/prevly-waitlist.gs](C:/Users/noete/Desktop/Prevly/google-apps-script/prevly-waitlist.gs).
- Remplace `REPLACE_WITH_YOUR_SPREADSHEET_ID`.
- Clique `Deploy > New deployment`.
- Type: `Web app`.
- Execute as: `Me`.
- Who has access: `Anyone`.
- Déploie puis copie l'URL finissant par `/exec`.

## 3. Brancher la landing
- Ouvre [index.html](C:/Users/noete/Desktop/Prevly/index.html).
- Remplace `REPLACE_WITH_YOUR_DEPLOYMENT_ID` dans `WAITLIST_ENDPOINT` par l'identifiant réel de ton script.
- Redéploie sur Vercel.

Exemple:
```js
var WAITLIST_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxxxxxxxxxxxxxxxxxxxxxxxxxxxx/exec';
```

## 4. Vérifier
- Entre un email sur la landing.
- Vérifie qu'une ligne est ajoutée dans le Google Sheet.
- Export Excel: `Fichier > Télécharger > Microsoft Excel (.xlsx)`.
