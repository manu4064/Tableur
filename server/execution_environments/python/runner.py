import sys
import json
import numpy
import pandas

def execute():
    try:
        with open('code.py', 'r') as f:
            code = f.read()

        with open('args.json', 'r') as f:
            args = json.load(f)

        # Prepare the execution scope
        globals_dict = {
            '__builtins__': {
                'print': print,
                'len': len,
                'range': range,
                'str': str,
                'int': int,
                'float': float,
                'list': list,
                'dict': dict,
                'tuple': tuple,
                'set': set,
                'abs': abs,
                'round': round,
                'max': max,
                'min': min,
                'sum': sum,
                'sorted': sorted,
                '__import__': __import__
            },
            'numpy': numpy,
            'pandas': pandas,
        }
        locals_dict = {'args': args}

        # Wrap the user code in a function
        wrapped_code = f"""
def NOUVELLE_FONCTION(*args):
{code}

result = NOUVELLE_FONCTION(*args)
"""
        exec(wrapped_code, globals_dict, locals_dict)

        result = locals_dict.get('result')

        # Serialize the result to JSON
        # This is a very basic serializer, might need to be improved
        # to handle more complex types (e.g., numpy arrays)
        def default_serializer(o):
            if isinstance(o, (numpy.ndarray,)):
                return o.tolist()
            if isinstance(o, (numpy.generic,)):
                return o.item()
            return f"unserializable type: {type(o)}"

        output = json.dumps({"result": result}, default=default_serializer)

        print(output)

    except Exception as e:
        error_output = json.dumps({"error": str(e)})
        print(error_output, file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    execute()
