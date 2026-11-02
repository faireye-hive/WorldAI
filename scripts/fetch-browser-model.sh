#!/usr/bin/env bash
# Mirrors ONLY the two ONNX variants used by WorldAI into the GitHub Pages build.
# These large files are not committed to Git (GitHub rejects regular files >100 MB).
set -euo pipefail

OUT="${1:-dist/models/v1}"
MODEL="onnx-community/SmolLM2-135M-Instruct-ONNX-GQA"
REVISION="${WORLD_AI_MODEL_REVISION:-main}"
BASE="https://huggingface.co/${MODEL}/resolve/${REVISION}"
DEST="${OUT%/}/${MODEL}"
mkdir -p "${DEST}/onnx"

download() {
  local relative="$1" path="${DEST}/$1" min_bytes="${2:-1}"
  mkdir -p "$(dirname "${path}")"
  if [[ -s "${path}" ]] && [[ "$(wc -c < "${path}")" -ge "${min_bytes}" ]]; then
    echo "Em cache: ${relative}"
    return
  fi
  echo "Baixando: ${relative}"
  curl --fail --location --silent --show-error --retry 4 --retry-all-errors --connect-timeout 30 \
    --output "${path}.part" "${BASE}/${relative}?download=true"
  local bytes
  bytes="$(wc -c < "${path}.part")"
  if [[ "${bytes}" -lt "${min_bytes}" ]]; then
    echo "Arquivo incompleto: ${relative} (${bytes} bytes)" >&2
    rm -f "${path}.part"
    exit 1
  fi
  mv "${path}.part" "${path}"
}
for file in config.json generation_config.json tokenizer.json tokenizer_config.json \
  special_tokens_map.json merges.txt vocab.json; do
  download "${file}"
done
# q8 (CPU/WASM) + q4f16 (WebGPU). Each is over 100 MB.
download "onnx/model_quantized.onnx" 80000000
download "onnx/model_q4f16.onnx" 80000000

echo "Modelos preparados para servir sob /WorldAI/models/v1/"
