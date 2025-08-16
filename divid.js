const args = process.argv.slice(2);

if (args.length !== 2) {
  throw new Error('Please provide exactly two numbers.');
}

const num1 = parseFloat(args[0]);
const num2 = parseFloat(args[1]);

if (isNaN(num1) || isNaN(num2)) {
  throw new Error('Both arguments must be numbers.');
}

if (num2 === 0) {
  throw new Error('Error: Cannot divide by zero.');
} else {
  const result = num1 / num2;
  console.log('The result is:', result);
}