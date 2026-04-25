type FormState = {
  canSubmit: boolean
  isSubmitting: boolean
}

type FieldLike = {
  state: {
    meta: {
      errors: unknown[]
    }
  }
}

export function fieldError(field: FieldLike) {
  const error = field.state.meta.errors[0]

  if (!error) {
    return null
  }

  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Invalid value.'
}

export function canSubmitForm(state: FormState, pending = false) {
  return state.canSubmit && !state.isSubmitting && !pending
}

export const fieldErrorClass = 'text-sm text-destructive'
