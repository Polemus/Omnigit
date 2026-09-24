/**
 * Android: the size Compose draws text at, which is the app's own rather than the phone's.
 *
 * Every native row, section header and menu here is Compose, and Compose text multiplies by
 * the `fontScale` on its density - which comes from the system configuration, so a phone set
 * to large text draws this app's rows large whatever the app would prefer. There is no prop
 * for it: `patches/@expo+ui+57.0.19.patch` adds one place to put a scale (`AppFontScale`),
 * which every `Host` hands to its content, and `ExpoUI.setFontScale` is how it is set.
 *
 * Because that is a patch to a module Expo ships prebuilt, `package.json` also asks
 * autolinking to build `expo-ui` from source - without it the patched Kotlin is never
 * compiled and nothing here has any effect. Both only reach a phone in a new build, so the
 * call is optional twice over: a build without the patch has no `setFontScale` to call, and
 * its rows go on following the phone.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect } from 'react';

interface ExpoUIModule {
  setFontScale?: (scale: number) => void;
}

export function useNativeTextScale(scale: number): void {
  useEffect(() => {
    const expoUI = requireOptionalNativeModule<ExpoUIModule>('ExpoUI');
    expoUI?.setFontScale?.(scale);
  }, [scale]);
}
