# Placement – Cité Royale / Sainte Cène

Application locale pour placer jusqu’à **2 personnes par bloc** sur les plans Auditorium (RDC 1–13, Mezzanine 14–23).

## Lancement

```bash
npm install
npm run dev
```

Ouvrir l’URL affichée (souvent `http://localhost:5173`).

## Fonctionnalités

- Plans SVG interactifs (formes, allées, portes, chaire, zone rouge)
- Clic sur un bloc → panneau d’affectation (2 emplacements)
- Indicateurs d’occupation 0/2, 1/2, 2/2
- Sidebar : ajout, import Excel, recherche, filtres Tous / Non placés / Placés
- Stats globales et par niveau
- Zoom du plan
- Tableau récapitulatif
- Export Excel, JSON et PDF
- Sauvegarde automatique (`localStorage`)

## Import Excel

| Nom           | Bloc | Place |
|---------------|------|-------|
| Marie Dupont  | 3    | 1     |
| Jean Martin   | 3    | 2     |
| Paul Bernard  |      |       |
# Plan_Icc
