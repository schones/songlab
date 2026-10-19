import verovio, cairosvg, sys
from pypdf import PdfWriter, PdfReader
out=sys.argv[1]
tk=verovio.toolkit()
tk.setOptions({"pageWidth":2100,"pageHeight":2970,"scale":40,"adjustPageHeight":False,
  "footer":"none","breaks":"line","spacingSystem":14,"header":"auto"})
import re
x=open(f'{out}/Dont_Be_Sad.musicxml').read()
x=re.sub(r'\s*<(root|bass)-alter>0</(root|bass)-alter>','',x)
open(f'{out}/Dont_Be_Sad.musicxml','w').write(x)
tk.loadData(x)
n=tk.getPageCount(); print('pages',n)
w=PdfWriter()
for i in range(1,n+1):
    svg=tk.renderToSVG(i)
    for cp,ch in {'\uea64':'\u266d','\uea66':'\u266f','\uea65':'\u266e','\ueca5':'\u2669'}.items():
        svg=svg.replace(cp,'<tspan font-family="DejaVu Sans">'+ch+'</tspan>')
    cairosvg.svg2pdf(bytestring=svg.encode(), write_to=f'{out}/p{i}.pdf')
    cairosvg.svg2png(bytestring=svg.encode(), write_to=f'{out}/p{i}.png', output_width=1400, background_color='white')
    for pg in PdfReader(f'{out}/p{i}.pdf').pages: w.add_page(pg)
w.write(f'{out}/Dont_Be_Sad.pdf')
