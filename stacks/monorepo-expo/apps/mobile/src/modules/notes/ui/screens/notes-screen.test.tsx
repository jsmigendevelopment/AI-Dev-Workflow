import { ApiError } from '@repo/api-client'
import type { NoteDto } from '@repo/contracts'
import { screen, userEvent, waitFor } from '@testing-library/react-native'
import { fakeApi, renderWith } from '@/test/render'
import { NotesScreen } from './notes-screen'

const note = (id: string, title: string): NoteDto => ({ id, title, createdAt: 1, updatedAt: 1 })
const page = (items: NoteDto[], nextCursor: string | null = null) => ({ items, nextCursor })

describe('NotesScreen', () => {
  it('lists the notes from the API', async () => {
    const list = jest.fn().mockResolvedValue(page([note('1', 'Milk'), note('2', 'Bread')]))
    await renderWith(<NotesScreen />, { api: fakeApi({ notes: { list } }) })
    expect(await screen.findByText('Milk')).toBeOnTheScreen()
    expect(screen.getByText('Bread')).toBeOnTheScreen()
    expect(list).toHaveBeenCalledWith({ cursor: undefined, limit: 20 }, expect.anything())
  })

  it('shows the empty state', async () => {
    await renderWith(<NotesScreen />, {
      api: fakeApi({ notes: { list: jest.fn().mockResolvedValue(page([])) } }),
    })
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen()
  })

  it("shows the server's safe message and retries on request", async () => {
    const list = jest
      .fn()
      .mockRejectedValueOnce(
        new ApiError('unavailable', 'Could not reach the server. Check your connection.'),
      )
      .mockResolvedValueOnce(page([note('1', 'Milk')]))
    await renderWith(<NotesScreen />, { api: fakeApi({ notes: { list } }) })
    expect(await screen.findByText('Could not reach the server. Check your connection.')).toBeOnTheScreen()
    await userEvent.setup().press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Milk')).toBeOnTheScreen()
  })

  it('creates a note and refreshes the list', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce(page([]))
      .mockResolvedValue(page([note('1', 'Milk')]))
    const create = jest.fn().mockResolvedValue(note('1', 'Milk'))
    await renderWith(<NotesScreen />, { api: fakeApi({ notes: { list, create } }) })
    await screen.findByText('No notes yet')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText('New note'), '  Milk ')
    await user.press(screen.getByRole('button', { name: 'Add note' }))

    expect(create).toHaveBeenCalledWith({ title: 'Milk' })
    expect(await screen.findByText('Milk')).toBeOnTheScreen()
    await waitFor(() => expect(screen.getByLabelText('New note')).toHaveDisplayValue(''))
  })

  it('checks the title with the shared contract before calling the API', async () => {
    const create = jest.fn()
    await renderWith(<NotesScreen />, {
      api: fakeApi({ notes: { list: jest.fn().mockResolvedValue(page([])), create } }),
    })
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Give the note a title.')).toBeOnTheScreen()
    expect(create).not.toHaveBeenCalled()
  })

  it("shows the server's field message when it rejects the title", async () => {
    const create = jest
      .fn()
      .mockRejectedValue(
        new ApiError('validation', 'Some fields need attention.', { title: ['Already taken.'] }),
      )
    await renderWith(<NotesScreen />, {
      api: fakeApi({ notes: { list: jest.fn().mockResolvedValue(page([])), create } }),
    })
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('New note'), 'Milk')
    await user.press(screen.getByRole('button', { name: 'Add note' }))
    expect(await screen.findByText('Already taken.')).toBeOnTheScreen()
  })

  it('deletes a note', async () => {
    const list = jest
      .fn()
      .mockResolvedValueOnce(page([note('1', 'Milk')]))
      .mockResolvedValue(page([]))
    const remove = jest.fn().mockResolvedValue({ id: '1' })
    await renderWith(<NotesScreen />, { api: fakeApi({ notes: { list, remove } }) })
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Delete Milk' }))
    expect(remove).toHaveBeenCalledWith('1')
    expect(await screen.findByText('No notes yet')).toBeOnTheScreen()
  })
})
