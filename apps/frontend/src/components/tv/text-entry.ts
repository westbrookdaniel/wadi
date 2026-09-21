export function isTextEntry(element: Element): element is HTMLInputElement | HTMLTextAreaElement {
  return element instanceof HTMLTextAreaElement && !element.readOnly || element instanceof HTMLInputElement &&
    !element.readOnly && ['text', 'search', 'password', 'email', 'url', 'tel', 'number'].includes(element.type)
}

