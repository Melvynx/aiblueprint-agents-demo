function divide(a, b, message) {
  if (b !== 0) {
    return a / b + message;
  }

  throw new Error("Division by zero is not allowed.");
}
