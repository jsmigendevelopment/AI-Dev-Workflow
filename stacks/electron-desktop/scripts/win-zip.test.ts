import { describe, expect, it } from 'vitest'

import { missingFromZip } from './win-zip.ts'

describe('the Windows zip', () => {
  it('WHEN the win32 zip is checked THEN it must hold the .exe and resources/app.asar', () => {
    const full = ['my-app-win32-x64/my-app.exe', 'my-app-win32-x64/resources/app.asar']
    expect(missingFromZip(full, 'my-app')).toEqual([])
    expect(missingFromZip(['my-app-win32-x64/my-app.exe'], 'my-app')).toEqual(['resources/app.asar'])
    expect(missingFromZip(['my-app-win32-x64/resources/app.asar'], 'my-app')).toEqual(['my-app.exe'])
  })
})
