BLY Demo — organized project
================================

Folder structure:

index.html                Website entry point
css/style.css             Original CSS (unchanged)
js/script.js              Original JavaScript (only audio paths changed)
assets/images/            Put bly-logo.png and portrait.png here
assets/audio/             Put click.mp3, slide.mp3, release.mp3 here
original/index.html       Exact backup of the file you supplied

IMPORTANT
---------
The images and audio were not included in the uploaded text file.
Copy your existing PNG and MP3 files into the folders above.

Changes made:
- Moved the inline CSS into css/style.css, keeping its content unchanged.
- Moved the inline JavaScript into js/script.js, keeping its logic unchanged.
- Replaced the inline <style> and <script> blocks with references to the files.
- Changed only two image paths and three audio paths to point to their folders.
- No functions, animations, timings, colors, layout values or other logic changed.

To run locally, open a terminal inside this folder and run:
  py -m http.server 8000
Then visit http://localhost:8000

The site also needs internet access for its existing html2canvas and QRCode CDN libraries.
