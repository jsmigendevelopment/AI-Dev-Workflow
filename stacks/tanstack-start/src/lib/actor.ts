/** Who is asking. Resolved on the server from the session; never read from the request body. */
export interface Actor {
  userId: string
}
