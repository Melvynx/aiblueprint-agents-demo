const args = process.argv.slice(2);

if (args.length !== 2) {
  console.log('Please provide exactly two numbers.');
  process.exit(0);
}

const num1 = parseFloat(args[0]);
const num2 = parseFloat(args[1]);

if (isNaN(num1) || isNaN(num2)) {
  console.log('Both arguments must be numbers.');
  process.exit(0);
}

if (num2 === 0) {
  console.log('Error: Cannot divide by zero.');
} else {
  const result = num1 / num2;
  console.log('The result is:', result);
}
