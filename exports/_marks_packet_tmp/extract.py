import zipfile
z = zipfile.ZipFile("/home/runner/workspace/attached_assets/MARKS-RULES-FINAL-Replit-Packet_(1)_1787347742800.zip")
z.extractall("/home/runner/workspace/exports/_marks_packet_tmp")
print(z.namelist())
