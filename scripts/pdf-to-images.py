#!/usr/bin/env python3
"""
将 PDF 文件逐页转换为 PNG 图片。
用法: python pdf-to-images.py <input_pdf_path> <output_dir> [--dpi 150]
输出: stdout 打印 JSON {"pages": [{"pageNumber": 1, "filename": "page-1.png"}, ...]}
"""
import sys
import json
import os
import fitz


def main():
    if len(sys.argv) < 3:
        print("Usage: pdf-to-images.py <input_pdf_path> <output_dir> [--dpi 150]", file=sys.stderr)
        sys.exit(1)

    input_path = sys.argv[1]
    output_dir = sys.argv[2]
    dpi = 150

    if len(sys.argv) >= 5 and sys.argv[3] == "--dpi":
        dpi = int(sys.argv[4])

    if not os.path.exists(input_path):
        print(json.dumps({"error": f"File not found: {input_path}"}), file=sys.stderr)
        sys.exit(1)

    os.makedirs(output_dir, exist_ok=True)

    doc = fitz.open(input_path)
    pages = []

    for i in range(len(doc)):
        page = doc.load_page(i)
        # fitz 的矩阵缩放: dpi/72
        zoom = dpi / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        filename = f"page-{i + 1}.png"
        output_path = os.path.join(output_dir, filename)
        pix.save(output_path)
        pages.append({"pageNumber": i + 1, "filename": filename})

    doc.close()
    print(json.dumps({"pages": pages, "dpi": dpi}))


if __name__ == "__main__":
    main()
