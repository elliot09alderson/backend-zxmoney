import bcrypt from 'bcryptjs'

export const hash = (pw) => bcrypt.hash(pw, 10)
export const compare = (pw, h) => bcrypt.compare(pw, h)
