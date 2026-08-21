import zipfile, os

zpath = 'attached_assets/MARKS-RULES-FINAL-Replit-Packet_(1)_1787347742800.zip'
outdir = 'exports/_marks_packet_tmp'
os.makedirs(outdir, exist_ok=True)
with zipfile.ZipFile(zpath) as z:
    names = z.namelist()
    z.extractall(outdir)

for root, dirs, files in os.walk(outdir):
    for f in files:
        print(os.path.join(root, f))
