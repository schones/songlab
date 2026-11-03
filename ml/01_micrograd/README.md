# Session 1 — micrograd

1. `engine.py` — the `Value` class (data, grad, _backward, _prev, _op), +, *, tanh/exp/pow, `backward()` with topological sort.
2. `nn.py` — `Neuron`, `Layer`, `MLP`, `parameters()`.
3. `train_toy.py` — the 4-example toy dataset from the lecture; training loop (forward, zero grads, backward, update).
4. `triads.py` — the SongLab exercise:
   - Input: 12-dim pitch-class vector (1.0 where a pitch class is present).
   - Label: +1 major, -1 minor (tanh output, MSE loss as in the lecture).
   - 24 root-position triads are too easy — the pitch-class vector ignores inversion, so instead make it harder:
     drop one note at random, or add a 7th, and see how the net handles ambiguous inputs.
   - Hold out a few keys entirely as a test set. Does it generalise to keys it never saw?
5. Stretch: rebuild `engine.py` from a blank file without looking.
