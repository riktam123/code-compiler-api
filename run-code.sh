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
    cp "$SOURCE_FILE" "$TMP_DIR/Program.cs"

    cat <<EOF > "$TMP_DIR/run.csproj"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>
EOF

    cd "$TMP_DIR"
    export DOTNET_CLI_TELEMETRY_OPTOUT=1
    export DOTNET_NOLOGO=1
    export DOTNET_CLI_UI_LANGUAGE=en

    # Capture build output (quiet suppresses restore chatter)
    BUILD_OUTPUT=$(dotnet build -o ./out --nologo --verbosity quiet 2>&1)
    BUILD_STATUS=$?

    if [ $BUILD_STATUS -ne 0 ]; then
      # Show only compiler errors, preserve order, remove duplicates
      echo "$BUILD_OUTPUT" \
        | grep -E "error CS[0-9]+" \
        | awk '!seen[$0]++'
      exit $BUILD_STATUS
    fi

    cd ./out
    DLL_FILE=$(ls *.dll | head -n 1)
    dotnet "$DLL_FILE" < "$INPUT_FILE"
    ;;

  ts)
    # Use npx to ensure tsc works inside container
    npx tsc "$SOURCE_FILE" --outDir /code && node /code/program.js < "$INPUT_FILE"
    ;;

  *)
    echo "Unsupported extension: $EXT"
    ;;
esac
