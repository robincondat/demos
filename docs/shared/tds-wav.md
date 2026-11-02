# Lecture WAV commune aux plateformes TDS

- `scripts/tds-wav.js` lit les métadonnées RIFF et conserve les octets du fichier.
  `decodeWav(file)` est réexporté par les modules `signals.js` de chaque démo.
- `scripts/tds_wav.py` est chargé dans chaque worker avant son moteur scientifique.
  `prepare_wav_signals(payload, buffers)` décode les octets avec SciPy et renseigne
  `samples`, `sourceSampleRate` et `sourceChannels`.

Les amplitudes natives sont conservées, sans normalisation automatique :
par exemple, les valeurs PCM 16 bits restent dans l'échelle entière d'origine.
Le calcul utilise des flottants 64 bits. Les fichiers multicanaux sont moyennés
en mono après conversion en flottants pour éviter les dépassements d'entiers.
La fréquence native reste distincte de `sampleRate`, la fréquence demandée
par l'utilisateur. Le lecteur ne rééchantillonne ni ne découpe le signal.

Les traitements pédagogiques restent dans les moteurs : FFT, convolution,
interpolation temporelle et multiplication optionnelle de la convolution par Δt.
L'avertissement de volume de Convolution est indépendant du lecteur commun :
il tient compte des deux signaux et du résultat, avant décodage et allocation.
Il permet de continuer ou d'annuler, sans limite mémoire arbitraire dans le moteur.

Tests depuis la racine `docs/` (NumPy et SciPy requis pour Python) :

```sh
node --test shared/tests/wav.test.mjs
python -B -m unittest discover -s shared/tests
```
