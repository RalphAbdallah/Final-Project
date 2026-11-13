// Prints every request: time, method and path (Session 16).
export function logger(req, res, next) {
  const time = new Date().toLocaleTimeString();
  console.log(`${time} ${req.method} ${req.path}`);
  next(); // pass it on
}
