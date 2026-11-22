# Turing Studio

An interactive, language-first **Turing Machine Visualizer & Step-by-Step Simulator** built around **Lewis & Papadimitriou** machine-combining diagram notation.

## Features

- **Language-First Composer** — Define a language or operation and watch the Turing Machine diagram regenerate live:
  - **Regular (Regex)**: Thompson NFA → Subset Construction DFA → Moore minimization → canonical `#Ⓨ#` / `#Ⓝ#` decider.
  - **Context-Free (CFG)**: Right-linear DFA compilation, parametric CFL matchers ($a^n b^n$, $a^n b^{2n}$, palindromes, balanced brackets, equal counts), and bottom-up reducer with CYK sampling.
  - **Unary Arithmetic (`I` / `#`)**: Monus (`m ∸ n`), Addition (`> S_L`), Multiplication, Quotient (`÷`), Remainder (`mod`), Scale (`k · n`), Add `k`, and Subtract `k`.
  - **Logical (Binary)**: `AND`, `OR`, `XOR`, `NAND`, `NOR`, `XNOR`, `IMPLIES`, interactive **Custom Truth Table**, `NOT`, `Increment +1`, `2's Complement`, and `Even/Odd Parity`.
  - **Comparison**: Unary (`I/#`) and Binary (`0/1`) relations (`=`, `≠`, `>`, `≥`, `<`, `≤`, `3-Way < = >`).
  - **Direct TM / L&P**: Compose chains of `S_L`, `S_R`, `C`, `E`, `L_#`, `R_#`, `L`, `R`, `Write`, parametric $x^n y^n z^n$, String Reversal, $w\#w$ equality, or edit rules directly via Transition Table / Text DSL / JSON.
- **Pure Lewis & Papadimitriou Notation** — Circle-free typographic schemas with real subscripts (`L#`, `R#`, `SL`, `SR`), `>` entry chevrons, rounded top return bracket loops, and live active-step highlighting.
- **Built-in Functions Viewer** — Inspect and load `Shift Left (S_L)`, `Shift Right (S_R)`, `Copy (C)`, `Erase (E)`, `Scan Left (L_#)`, and `Scan Right (R_#)`.
- **Formal Tape & Head Conventions**:
  - Universal blank/delimiter `#`
  - Canonical input `#w[#]` (head on trailing `#`, except `R_#` demo at `[#]w#`)
  - Canonical output `#output[#]` with head parked strictly at the `#` immediately after `output`
  - Deciders output `#Ⓨ#` (Accept) or `#Ⓝ#` (Reject)

## Local Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm test      # 140 Vitest tests across simulator, DSL, built-ins, and all 6 compilers
npm run build   # TypeScript type-check + Vite production build
```
