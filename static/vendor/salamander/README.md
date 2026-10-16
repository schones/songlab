# Salamander Grand Piano (mp3 subset)

Vendored sample set for the `/voicings` player (`static/shared/voicing-player.js`).
29 mp3 files, about 2 MB: one sample every minor third from A0 to A7, as in the
`SALAMANDER_URLS` map used throughout SongLab. Tone.Sampler pitch-shifts to
fill the gaps.

## Source

- Repository: https://github.com/Tonejs/audio, folder `salamander/`
- Commit: `869b6f8d9cddb47d966238c012041480b1ce517a` (the last commit touching
  that folder, 2020-04-30). Files were downloaded from
  `https://raw.githubusercontent.com/Tonejs/audio/<commit>/salamander/<name>.mp3`
  on 2026-10-16 and verified byte-for-byte against the sizes GitHub reports
  for that commit. `C8.mp3` exists in the repo but is not in the sample map
  and was not copied.
- The mp3 encodes are the Tone.js project's conversion of the original
  Salamander Grand Piano V3 set (Alexander Holm), as distributed with the
  Tone.js examples.

## Author and license

The Tonejs/audio repository carries no license file of its own (GitHub
reports none at this commit). The license comes from the sample set's own
`salamander/README` in that repository, which says, verbatim:

```
Licence: 

CC-by
http://creativecommons.org/licenses/by/3.0/


Author: Alexander Holm
```

That is Creative Commons Attribution 3.0 (CC BY 3.0):
https://creativecommons.org/licenses/by/3.0/. Attribution required:

> Salamander Grand Piano by Alexander Holm, licensed under CC BY 3.0.
> https://creativecommons.org/licenses/by/3.0/

The same README describes the instrument: "Salamander Grand Piano V2 / Yamaha
C5 / Recorded @ 48khz24bit / 16 Velocity layers Sampled in minor thirds from
the lowest A." The Tone.js subset keeps one velocity layer per sampled pitch.
