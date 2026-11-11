// jsdom non implementa i metodi di <dialog> (assente negli ambienti node)
if (globalThis.HTMLDialogElement) {
  HTMLDialogElement.prototype.showModal ??= function () { this.open = true }
  HTMLDialogElement.prototype.close ??= function () { this.open = false }
}
