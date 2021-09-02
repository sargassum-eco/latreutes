import React, { useState } from 'react';
import { useQueryClient } from 'react-query';
import {
  Box,
  Stack,
  Button,
  ButtonGroup,
  FormControl,
  FormLabel,
  Radio,
  RadioGroup,
  Input,
  Text,
  Code,
} from '@chakra-ui/react';

import useTxtResolver from '../../dns/lookup';

import { QUERY_REFETCH, useNetworkStatus, useNetworkJoiner } from './service';
import DNS_ZT_NETWORK_KEY from './dns';

// Components

interface NetworkIdJoinerProps {
  networkId: string;
  authToken: string;
}
function NetworkIdJoiner({ networkId, authToken }: NetworkIdJoinerProps) {
  const queryClient = useQueryClient();
  const networkJoiner = useNetworkJoiner(authToken, queryClient);
  const [joined, setJoined] = useState(false);
  const { data: networkResponse, isLoading } = useNetworkStatus(
    networkId,
    authToken,
    QUERY_REFETCH * 1000,
    QUERY_REFETCH * 1000
  );

  if (!networkId || isLoading) {
    return <></>;
  }

  // Bug: if NetworkIdJoiner is merely redrawn when the props change, rather than
  // being destroyed and created again, then joined will not reset, even though
  // we want it to reset!
  if (joined) {
    return <Text>Attempted to join {networkId}!</Text>;
  }

  if (networkResponse !== undefined) {
    const network = networkResponse.data;
    if (network.id === networkId) {
      return (
        <Text>
          This device has already joined the network with ZeroTier network&nbsp;
          ID <Code>{networkId}.</Code>
        </Text>
      );
    }
  }

  networkJoiner.mutate(networkId);
  setJoined(true);
  return <Text>Joining {networkId}...</Text>;
}

interface HostnameJoinerProps {
  hostname: string;
  authToken: string;
}
function HostnameJoiner({ hostname, authToken }: HostnameJoinerProps) {
  const { data: txtRecords, status } = useTxtResolver(hostname);

  if (!hostname) {
    return <></>;
  }

  switch (status) {
    case 'idle':
    case 'loading':
      return <Text>Loading...</Text>;
    case 'error':
      return (
        <Text>
          Error: Could not find any records at the provided hostname.
          <br />
          Did you enter a valid hostname? Are you connected to the internet, or
          at least to the server which stores the records for the hostname?
        </Text>
      );
    default:
      if (txtRecords === undefined) {
        return <Text>Error: unknown</Text>;
      }
  }

  const ztNetworkIdRecordPrefix = `${DNS_ZT_NETWORK_KEY}=`;
  const ztNetworkIdRecords = txtRecords.filter((record) =>
    record.startsWith(ztNetworkIdRecordPrefix)
  );
  if (ztNetworkIdRecords.length === 0) {
    return (
      <Text>
        Error: could not find any ZeroTier Network IDs published at the
        hostname!
        <br />
        Did you enter a valid hostname?
      </Text>
    );
  }
  if (ztNetworkIdRecords.length > 1) {
    return (
      <Text>
        Error: multiple ZeroTier Network IDs are published at the hostname!
      </Text>
    );
  }
  const ztNetworkId = ztNetworkIdRecords[0].slice(
    ztNetworkIdRecordPrefix.length
  );
  if (ztNetworkId.length === 0) {
    return (
      <Text>
        Error: the ZeroTier Network ID published at the hostname is empty! Did
        the operator of the hostname incorrectly configure their public records?
      </Text>
    );
  }

  return (
    <>
      <Text>
        The network at <Code>{hostname}</Code> has ZeroTier&nbsp; network ID{' '}
        <Code>{ztNetworkId}</Code>.
      </Text>
      <NetworkIdJoiner networkId={ztNetworkId} authToken={authToken} />
    </>
  );
}

interface JoinerFormProps {
  onClose(): void;
  authToken: string;
}
enum IdentifierType {
  hostname = 'hostname',
  networkId = 'networkId',
}
function JoinerForm({ onClose, authToken }: JoinerFormProps): JSX.Element {
  const [identifier, setIdentifier] = useState('');
  const [identifierType, setIdentifierType] = useState(IdentifierType.hostname);
  const [submitted, setSubmitted] = useState(false);

  if (identifier && submitted) {
    let joiner;
    switch (identifierType) {
      case IdentifierType.hostname:
        joiner = <HostnameJoiner hostname={identifier} authToken={authToken} />;
        break;
      default:
        joiner = (
          <NetworkIdJoiner networkId={identifier} authToken={authToken} />
        );
        break;
    }
    return (
      <Stack pt={4}>
        {joiner}
        <ButtonGroup colorScheme="teal">
          <Button
            onClick={() => {
              setSubmitted(false);
            }}
          >
            Join Another Network
          </Button>
          <Button onClick={onClose}>Close</Button>
        </ButtonGroup>
      </Stack>
    );
  }

  let identifierTitle = 'Identifier';
  let identifierPlaceholder = 'Identifier for the network';
  switch (identifierType) {
    case IdentifierType.hostname:
      identifierTitle = 'Network Hostname';
      identifierPlaceholder = 'Hostname for the network';
      break;
    case IdentifierType.networkId:
      identifierTitle = 'ZeroTier Network ID';
      identifierPlaceholder = 'ZeroTier Network ID for the network';
      break;
    default:
      break;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const target = e.target as typeof e.target & {
          identifier: { value: string };
        };
        const {
          identifier: { value: submittedIdentifier },
        } = target;
        switch (identifierType) {
          case IdentifierType.hostname: {
            let submittedHostname = '';
            try {
              submittedHostname = new URL(submittedIdentifier).hostname;
            } catch {
              submittedHostname = submittedIdentifier;
            }
            setIdentifier(submittedHostname);
            break;
          }
          default: {
            setIdentifier(submittedIdentifier);
            break;
          }
        }
        setSubmitted(true);
      }}
    >
      <Stack pt={4} spacing={4}>
        <FormControl id="identifier" isRequired>
          <FormLabel>Identifier Type</FormLabel>
          <RadioGroup
            onChange={(value) => {
              switch (value) {
                case 'hostname':
                  setIdentifierType(IdentifierType.hostname);
                  break;
                default:
                  setIdentifierType(IdentifierType.networkId);
                  break;
              }
            }}
            value={identifierType}
          >
            <Stack direction="row">
              <Radio value="hostname">Hostname</Radio>
              <Radio value="networkId">Network ID</Radio>
            </Stack>
          </RadioGroup>
        </FormControl>
        <FormControl id="identifier" isRequired>
          <FormLabel>{identifierTitle}</FormLabel>
          <Input
            type="text"
            name="identifier"
            placeholder={identifierPlaceholder}
          />
        </FormControl>
        <Box>
          <Button type="submit" colorScheme="teal">
            Join
          </Button>
        </Box>
      </Stack>
    </form>
  );
}

export default JoinerForm;