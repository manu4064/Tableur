#!/bin/sh

# Compile the C code, linking math and json-c libraries
# Capture stderr to a file to be able to show it to the user
gcc -o program code.c -lm -ljson-c 2> compiler_errors.log

if [ $? -ne 0 ]; then
    # Read the compiler errors and format as JSON
    errors=$(cat compiler_errors.log | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g')
    echo "{\"error\": \"Compilation failed: $errors\"}" >&2
    exit 1
fi

# Execute the compiled program and capture its output
output=$(./program)
exit_code=$?

if [ $exit_code -ne 0 ]; then
    echo "{\"error\": \"Execution failed with exit code $exit_code\"}" >&2
    exit 1
fi

echo $output
