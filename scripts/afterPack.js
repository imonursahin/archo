// Ad-hoc sign the macOS app after packing. electron-builder with identity:null
// leaves a broken signature (it modifies the bundle after Electron's own
// ad-hoc signature), which makes Apple Silicon report the downloaded app as
// "damaged" once it's quarantined. Re-signing the whole bundle ad-hoc (-)
// produces a valid signature, so the app opens (via right-click → Open) instead
// of being flagged as damaged. This is NOT notarization — Gatekeeper still shows
// the "unidentified developer" prompt, which is expected for an unsigned app.
const { execSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  console.log(`  • ad-hoc signing  ${appPath}`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
}
