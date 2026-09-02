# Build Stage
FROM golang:alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY main.go ./
# Build a statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o phgc-server .

# Run Stage
FROM alpine:latest  
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /root/
COPY --from=builder /app/phgc-server .

EXPOSE 8080
CMD ["./phgc-server"]
