rm -r "./chrome"
cp -r "./web" "./chrome"
rm -r "./chrome/manifest_v2.json"
mv "./chrome/manifest_v3.json" "./chrome/manifest.json"

rm -r "./safari"
cp -r "./web" "./safari"
rm -r "./safari/manifest_v2.json"
mv "./safari/manifest_v3.json" "./safari/manifest.json"

rm -r "./firefox"
cp -r "./web" "./firefox"
rm "./firefox/manifest_v3.json"
mv "./firefox/manifest_v2.json" "./firefox/manifest.json"