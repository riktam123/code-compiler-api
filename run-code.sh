#!/bin/sh
SOURCE_FILE=$1
INPUT_FILE=$2

EXT="${SOURCE_FILE##*.}"

case "$EXT" in
  js)
    node "$SOURCE_FILE" < "$INPUT_FILE"
    ;;
  py)
    python3 "$SOURCE_FILE" < "$INPUT_FILE"
    ;;
  c)
    gcc "$SOURCE_FILE" -o /code/program.out && /code/program.out < "$INPUT_FILE"
    ;;
  cpp)
    g++ "$SOURCE_FILE" -o /code/program.out && /code/program.out < "$INPUT_FILE"
    ;;
  java)
    javac "$SOURCE_FILE" && java -cp /code Program < "$INPUT_FILE"
    ;;
  go)
    go run "$SOURCE_FILE" < "$INPUT_FILE"
    ;;
  rb)
    ruby "$SOURCE_FILE" < "$INPUT_FILE"
    ;;
  php)
    php "$SOURCE_FILE" < "$INPUT_FILE"
    ;;
  rs)
    rustc "$SOURCE_FILE" -o /code/program.out && /code/program.out < "$INPUT_FILE"
    ;;
  kt)
    # Compile Kotlin
    kotlinc "$SOURCE_FILE" -include-runtime -d /code/Program.jar
    COMPILE_STATUS=$?
    if [ $COMPILE_STATUS -ne 0 ]; then
        echo "Compilation failed with exit code $COMPILE_STATUS"
        exit $COMPILE_STATUS
    fi

    # Run Kotlin JAR
    java -jar /code/Program.jar < "$INPUT_FILE"
    ;;
  cs)
    TMP_DIR=$(mktemp -d)
    WRAPPED_FILE="$TMP_DIR/Program.cs"

    # Wrap user code into a Program class with Main()
    echo "using System;" > "$WRAPPED_FILE"
    echo "class Program { static void Main() {" >> "$WRAPPED_FILE"
    cat "$SOURCE_FILE" >> "$WRAPPED_FILE"
    echo "} }" >> "$WRAPPED_FILE"

    # Create minimal project
    cat <<EOF > "$TMP_DIR/run.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>
EOF

    cd "$TMP_DIR"
    dotnet build -o ./out -nologo --verbosity quiet
    BUILD_STATUS=$?

    if [ $BUILD_STATUS -ne 0 ]; then
        echo "C# compilation failed with exit code $BUILD_STATUS"
        exit $BUILD_STATUS
    fi

    # Run from output folder
    cd out
    dotnet Program.dll < "$INPUT_FILE"
    ;;

  ts)
    # Use npx to ensure tsc works inside container
    npx tsc "$SOURCE_FILE" --outDir /code && node /code/program.js < "$INPUT_FILE"
    ;;
  *)
    echo "Unsupported extension: $EXT"
    ;;
esac
