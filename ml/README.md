# SongLab ML

Learning PyTorch through small music models, following the SongLab ML Syllabus
(Karpathy's *Neural Networks: Zero to Hero* + a SongLab exercise each Wednesday).

## Environment (Mac mini)

```bash
python3 -m venv ~/.venvs/songlab-ml        # Python 3.14 works (torch 2.15)
source ~/.venvs/songlab-ml/bin/activate
pip install -r ml/requirements.txt
python -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"  # expect True
```

Separate from the Flask app's `venv/` in the repo root.

Use `device = "mps" if torch.backends.mps.is_available() else "cpu"`.

From the MacBook: `ssh -L 8888:localhost:8888 <mac-mini>`, then `jupyter lab --no-browser` on the mini.

## Layout

| Folder | Session | Contents |
| --- | --- | --- |
| `01_micrograd/` | 1 (Nov 4) | micrograd typed from scratch; major/minor triad classifier |
| `02_chord_bigram/` | 2 | chord-transition bigram model |
| `03_chord_mlp/` | 3, 7 | next-chord MLP, then deeper model |
| `chord_classifier/` | 4, 5, 10 | SongLab project 1 |
| `chord_transformer/` | 8, 9 | SongLab project 2 |
| `data/`, `checkpoints/` | — | gitignored |

Conventions: plain scripts first, notebooks only for exploration. Type the code; don't paste from the lecture notebooks.
