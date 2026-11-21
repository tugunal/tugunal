#!/usr/bin/env python3
"""Fail-closed policy: never ship a second Android app as an update.
Public certificate fingerprint only; no signing credentials belong in source.
"""
from pathlib import Path
import re

GRADLE = Path("app/build.gradle").read_text(encoding="utf-8")
CI = Path(".github/workflows/android.yml").read_text(encoding="utf-8")
APP_ID = "com.tugunal.akillimuhasebe.stable"
CERT_SHA256 = "2361a76413916f19f0a0ccf5530a0d5213b88c2c2600cf598b49239d7d37adf5"

def demand(test: bool, message: str) -> None:
    if not test:
        raise SystemExit("FAIL: " + message)

package_ids = re.findall(r'^\s*applicationId\s+"([^"]+)"', GRADLE, re.M)
demand(package_ids == [APP_ID], f"One canonical applicationId required: {package_ids}")
demand('versionCode 20' in GRADLE and 'versionName "1.2.5"' in GRADLE,
       "Release version number is missing or wrong")
demand("applicationIdSuffix \".internal\"" in GRADLE,
       "Debug builds must use internal (non-release) identity")
demand("applicationIdSuffix \".stable\"" not in GRADLE, "Duplicate stable suffix")
demand("applicationIdSuffix \".deneme\"" not in GRADLE, "Legacy test app package forbidden")
demand("installfix" not in GRADLE, "Legacy alternative install build forbidden")
demand(CI.count("assembleRelease") == 1, "Only one release APK may be built")
for s in ("assembleDebug", "assembleInstallfix", "-DENEME.apk", "-KURULUM.apk"):
    demand(s not in CI, "Forbidden alternate APK artifact: " + s)
demand(CERT_SHA256 in CI, "Known permanent signing fingerprint must be checked")
demand("steps.signing.outputs.available == 'true'" in CI,
       "Unsigned APK must never be presented as installable")
demand("name='com.tugunal.akillimuhasebe.stable'" in CI,
       "APK package verification missing")
demand("find dist -maxdepth 1 -name '*.apk'" in CI,
       "One-APK publication check missing")
java = Path("app/src/main/java/com/tugunal/akillimuhasebe/MainActivity.java").read_text(encoding="utf-8")
demand('CANONICAL_PACKAGE_ID = "' + APP_ID + '"' in java,
       "Native in-app updater must pin the applicationId")
demand('verifyUpdateApkIdentity(target)' in java,
       "Downloaded APK must be validated before install")
demand('name.equals("AkilliMuhasebe-v" + latestVersion + ".apk")' in java,
       "Updater must use only the exact signed release asset")
demand("private void verifyUpdateApkIdentity" in java, "Signature comparison missing")
print("PASS: One permanent signed application, one package ID, one distributable APK")
