import { Button, styled } from "@mui/material";

const PrimaryButton = styled(Button)({
    textAlign: "center",
    display: "inline-block",
    // margin: 5,
    fontWeight: "bold",
    // padding: "10px 0 10px 10px",
    background: "lightgray",
    textShadow: "-1px -1px black, 1px 1px white",
    color: "gray",
    borderRadius: "7px",
    boxShadow: "0 .2em gray",
    cursor: "pointer",
    "&:hover": {
        background: "lightgray",
        boxShadow: "0 .2em gray",
    },
    "&:active": {
        boxShadow: "none",
        position: "relative",
        top: ".2em"
    }
})

export default PrimaryButton;