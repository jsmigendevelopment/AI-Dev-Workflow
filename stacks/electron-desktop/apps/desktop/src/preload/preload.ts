import { COMMAND_CHANNEL, CONTRACT_VERSION } from '@app/contract/envelope'
import type { EventPayload } from '@app/contract/events'
import { EVENT_CHANNEL, parseEvent } from '@app/contract/events'
import { newId } from '@app/contract/ids'
import type { AppApi } from '@app/contract/preload-api'
import { API_KEY } from '@app/contract/preload-api'
import type { IpcRendererEvent } from 'electron'
import { contextBridge, ipcRenderer } from 'electron'

// One bundle on Web APIs (Electron 45's sandboxed preload). It wraps each command in the envelope,
// with a fresh UUIDv7 as its request ID; main checks the sender and the payload before the engine sees it.
const api: AppApi = {
  send: (name, ...args) =>
    ipcRenderer.invoke(COMMAND_CHANNEL, { id: newId(), name, v: CONTRACT_VERSION, payload: args[0] }),
  // Events from main are checked again here, so the screen only ever gets a payload the contract allows.
  on: (name, listener) => {
    const handle = (_event: IpcRendererEvent, raw: unknown) => {
      const event = parseEvent(raw)
      if (event?.name === name) listener(event.payload as EventPayload<typeof name>)
    }
    ipcRenderer.on(EVENT_CHANNEL, handle)
    return () => {
      ipcRenderer.removeListener(EVENT_CHANNEL, handle)
    }
  },
}

contextBridge.exposeInMainWorld(API_KEY, api)
